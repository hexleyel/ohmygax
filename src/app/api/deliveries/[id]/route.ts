import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";
import { loadSettings } from "@/lib/settings";
import { cylinderCategoryCodes } from "@/lib/categories";
import { normalizePhMobile, PH_MOBILE_HINT } from "@/lib/validation";
import { calculateVatAmount } from "@/lib/calc";

type RouteParams = { params: Promise<{ id: string }> };
type Item = { product_id: number; quantity: number; without_cylinder_qty?: number; withoutCylinderQty?: number; withoutCylinder?: boolean };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireAuth(req);
    const deliveryId = Number((await params).id);
    const body = await req.json();
    const customerId = Number(body.customer_id);
    const address = String(body.address ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const eta = String(body.eta ?? "");
    const items: Item[] = Array.isArray(body.items)
      ? body.items.map((item: Item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity), without_cylinder_qty: Number(item.without_cylinder_qty ?? item.withoutCylinderQty ?? (item.withoutCylinder ? item.quantity : 0)) || 0 }))
      : [];
    const paymentMethod = body.payment_method === "gcash" ? "gcash" : "cod";
    const gcashReference = paymentMethod === "gcash" ? String(body.gcash_reference ?? body.gcashReferenceNumber ?? "").trim() : null;
    const rawMobile = paymentMethod === "gcash" ? String(body.gcash_mobile ?? body.gcashMobileNumber ?? "").trim() : "";
    const gcashMobile = paymentMethod === "gcash" ? normalizePhMobile(rawMobile) : null;

    if (!Number.isInteger(deliveryId) || deliveryId <= 0) {
      return NextResponse.json({ error: "Invalid delivery order." }, { status: 400 });
    }
    const deliveryDate = new Date(eta);
    if (!Number.isInteger(customerId) || customerId <= 0 || !address || !/^\d{4}-\d{2}-\d{2}$/.test(eta) || Number.isNaN(deliveryDate.getTime())) {
      return NextResponse.json({ error: "Customer, address, and delivery date are required." }, { status: 400 });
    }
    if (
      items.length === 0 ||
      items.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0) ||
      new Set(items.map((item) => item.product_id)).size !== items.length
    ) {
      return NextResponse.json({ error: "Add valid items with positive quantities. Products must be unique." }, { status: 400 });
    }
    if (paymentMethod === "gcash" && !gcashReference) {
      return NextResponse.json({ error: "Enter the GCash reference number from the customer's confirmation." }, { status: 400 });
    }
    if (paymentMethod === "gcash" && !gcashMobile) {
      return NextResponse.json({ error: rawMobile ? `That is not a valid Philippine mobile number. ${PH_MOBILE_HINT}` : "Enter the mobile number the GCash payment came from." }, { status: 400 });
    }

    const existing = await db.delivery.findUnique({ where: { delivery_id: deliveryId } });
    if (!existing) return NextResponse.json({ error: "Delivery order not found." }, { status: 404 });
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Only pending delivery orders can be edited." }, { status: 409 });
    }

    const [customer, products, settings, cylinderCodes] = await Promise.all([
      db.customer.findUnique({ where: { customer_id: customerId } }),
      db.product.findMany({ where: { product_id: { in: items.map((item) => item.product_id) } } }),
      loadSettings(),
      cylinderCategoryCodes(),
    ]);
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    if (products.length !== items.length) {
      return NextResponse.json({ error: "One or more selected products could not be found." }, { status: 400 });
    }

    const productMap = new Map(products.map((product) => [product.product_id, product]));
    const lineData = items.map((item) => {
      const product = productMap.get(item.product_id)!;
      const isCylinder = cylinderCodes.has(product.category);
      const withoutQty = isCylinder ? Math.min(Math.max(item.without_cylinder_qty || 0, 0), item.quantity) : 0;
      const cylinderFee = Number((settings.cylinderFee * withoutQty).toFixed(2));
      return {
        ...item,
        without_cylinder_qty: withoutQty,
        cylinder_fee: cylinderFee,
        lineTotal: item.quantity * Number(product.selling_price) + cylinderFee,
      };
    });
    const subtotal = Number(items.reduce((sum, item) => sum + item.quantity * Number(productMap.get(item.product_id)?.selling_price || 0), 0).toFixed(2));
    const cylinderFees = Number(lineData.reduce((sum, item) => sum + item.cylinder_fee, 0).toFixed(2));
    const vatAmount = calculateVatAmount(subtotal, settings.vatRate);
    const total_amount = Number((subtotal + cylinderFees).toFixed(2));
    const updated = await db.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { delivery_id: deliveryId },
        data: { customer_id: customerId, address, eta: deliveryDate, notes: notes || null, total_amount, payment_method: paymentMethod, gcash_mobile: gcashMobile, gcash_reference: gcashReference },
      });
      await tx.deliveryItem.deleteMany({ where: { delivery_id: deliveryId } });
      await tx.deliveryItem.createMany({
        data: lineData.map((item) => ({ delivery_id: deliveryId, product_id: item.product_id, quantity: item.quantity, without_cylinder_qty: item.without_cylinder_qty, cylinder_fee: item.cylinder_fee })),
      });
      const result = await tx.delivery.findUniqueOrThrow({
        where: { delivery_id: deliveryId },
        include: { customer: true, items: { include: { product: true } } },
      });
      await writeAuditLog(tx, {
        user: session,
        action: "DELIVERY_UPDATE",
        module: "Delivery",
        details: `Updated delivery ${result.reference_no ?? `#${deliveryId}`} for ${customer.name}`,
      });
      return result;
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Delivery update failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update delivery." }, { status: 500 });
  }
}
