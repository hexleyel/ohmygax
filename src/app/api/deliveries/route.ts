import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { buildDeliveryRef, buildSalesOrderNo } from "@/lib/reference";
import { serialize } from "@/lib/serialize";
import { loadSettings } from "@/lib/settings";
import { cylinderCategoryCodes } from "@/lib/categories";
import { normalizePhMobile, PH_MOBILE_HINT } from "@/lib/validation";
import { calculateVatAmount } from "@/lib/calc";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const deliveries = await db.delivery.findMany({
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json(serialize(deliveries));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Delivery list error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

type IncomingItem = {
  product_id?: number;
  productId?: number;
  quantity: number;
  without_cylinder_qty?: number;
  withoutCylinderQty?: number;
  withoutCylinderCount?: number;
  withoutCylinder?: boolean | number;
  price?: number;
  unit_price?: number;
};
type Item = { product_id: number; quantity: number; without_cylinder_qty: number; price?: number };

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();
    const items: Item[] = Array.isArray(body.items)
      ? body.items.map((item: IncomingItem) => ({
          product_id: Number(item.product_id ?? item.productId),
          quantity: Number(item.quantity),
          without_cylinder_qty: Number(
            item.without_cylinder_qty ?? item.withoutCylinderQty ?? item.withoutCylinderCount ??
            (typeof item.withoutCylinder === "number" ? item.withoutCylinder : item.withoutCylinder ? item.quantity : 0),
          ) || 0,
          ...((item.price ?? item.unit_price) !== undefined ? { price: Number(item.price ?? item.unit_price) } : {}),
        }))
      : [];
    const requestedCustomerName = String(body.customer_name ?? body.customerName ?? "").trim();
    const customerId = Number(body.customer_id ?? body.customerId);
    const address = String(body.address ?? body.delivery_address ?? body.deliveryAddress ?? "").trim();
    const eta = String(body.eta ?? body.delivery_date ?? body.deliveryDate ?? "");
    const rawPaymentMethod = String(body.payment_method ?? body.mode_of_payment ?? body.modeOfPayment ?? "cod").trim().toLowerCase();
    const paymentMethod = rawPaymentMethod === "gcash" ? "gcash" : rawPaymentMethod === "cod" || rawPaymentMethod === "cash on delivery" ? "cod" : "invalid";
    const gcashReference = paymentMethod === "gcash" ? String(body.gcash_reference ?? body.gcashReferenceNumber ?? "").trim() : null;
    const rawMobile = paymentMethod === "gcash" ? String(body.gcash_mobile ?? body.gcashMobileNumber ?? "").trim() : "";
    const gcashMobile = paymentMethod === "gcash" ? normalizePhMobile(rawMobile) : null;

    if ((!Number.isInteger(customerId) || customerId <= 0) && !requestedCustomerName) {
      return NextResponse.json({ success: false, error: "Select a valid customer." }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ success: false, error: "A delivery address is required." }, { status: 400 });
    }
    const etaDate = new Date(eta);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eta) || Number.isNaN(etaDate.getTime()) || etaDate.toISOString().slice(0, 10) !== eta) {
      return NextResponse.json({ success: false, error: "A valid delivery date is required." }, { status: 400 });
    }
    if (paymentMethod === "invalid") {
      return NextResponse.json({ success: false, error: "Mode of payment must be COD or GCash." }, { status: 400 });
    }
    if (
      items.length === 0 ||
      items.some((item) => !Number.isInteger(item.product_id) || item.product_id! <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0 || (item.price !== undefined && (!Number.isFinite(item.price) || item.price < 0))) ||
      new Set(items.map((item) => item.product_id)).size !== items.length
    ) {
      return NextResponse.json({ success: false, error: "Add valid items with a product and positive quantity. Products must be unique." }, { status: 400 });
    }
    if (paymentMethod === "gcash" && !gcashReference) {
      return NextResponse.json({ success: false, error: "Enter the GCash reference number from the customer's confirmation." }, { status: 400 });
    }
    if (paymentMethod === "gcash" && !gcashMobile) {
      return NextResponse.json({ success: false, error: rawMobile ? `That is not a valid Philippine mobile number. ${PH_MOBILE_HINT}` : "Enter the mobile number the GCash payment came from." }, { status: 400 });
    }

    const [products, settings, cylinderCodes, customer] = await Promise.all([
      db.product.findMany({ where: { product_id: { in: items.map((item) => item.product_id) } } }),
      loadSettings(),
      cylinderCategoryCodes(),
      Number.isInteger(customerId) && customerId > 0
        ? db.customer.findUnique({ where: { customer_id: customerId } })
        : db.customer.findFirst({ where: { name: requestedCustomerName } }),
    ]);
    if (!customer) return NextResponse.json({ success: false, error: "Customer not found." }, { status: 400 });
    const resolvedCustomerId = customer.customer_id;
    if (requestedCustomerName && requestedCustomerName.toLowerCase() !== customer.name.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: "The selected customer name does not match the customer record." }, { status: 400 });
    }
    if (products.length !== items.length) return NextResponse.json({ success: false, error: "One or more selected products could not be found." }, { status: 400 });
    const priceMap = new Map(products.map((product) => [product.product_id, Number(product.selling_price)]));
    const productMap = new Map(products.map((product) => [product.product_id, product]));
    const lineData = items.map((item) => {
      const product = productMap.get(item.product_id)!;
      const isCylinder = cylinderCodes.has(product.category);
      const withoutQty = item.without_cylinder_qty || 0;
      if (!Number.isInteger(withoutQty) || withoutQty < 0 || withoutQty > item.quantity || (!isCylinder && withoutQty > 0)) {
        throw new Error(`Invalid without-cylinder quantity for ${product.name}.`);
      }
      if (product.stock_qty < item.quantity) {
        throw new Error(`Insufficient stock for selected item: ${product.name}. Available quantity: ${product.stock_qty}.`);
      }
      if (item.price !== undefined && Number(item.price) !== Number(product.selling_price)) {
        throw new Error(`The price for ${product.name} has changed. Refresh the order and try again.`);
      }
      const cylinderFeeRate = Number.isFinite(settings.cylinderFee) ? settings.cylinderFee : 150;
      const cylinderFee = Number((cylinderFeeRate * withoutQty).toFixed(2));
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        without_cylinder_qty: withoutQty,
        cylinder_fee: cylinderFee,
        lineTotal: item.quantity * (priceMap.get(item.product_id) || 0) + cylinderFee,
      };
    });
    const subtotal = Number(items.reduce((sum, item) => sum + item.quantity * (priceMap.get(item.product_id) || 0), 0).toFixed(2));
    const cylinderFees = Number(lineData.reduce((sum, line) => sum + line.cylinder_fee, 0).toFixed(2));
    const vatAmount = calculateVatAmount(subtotal, settings.vatRate);
    const total_amount = Number((subtotal + cylinderFees).toFixed(2));
    if (![subtotal, cylinderFees, vatAmount, total_amount].every(Number.isFinite)) {
      return NextResponse.json({ success: false, error: "Could not calculate a valid delivery total." }, { status: 400 });
    }

    const withRefs = await db.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          customer: { connect: { customer_id: resolvedCustomerId } },
          address,
          status: "pending",
          eta: etaDate,
          notes: body.notes || null,
          payment_method: paymentMethod,
          gcash_mobile: gcashMobile,
          gcash_reference: gcashReference,
          total_amount,
          items: {
            create: lineData.map((item) => ({
              product: { connect: { product_id: item.product_id } },
              quantity: item.quantity,
              without_cylinder_qty: item.without_cylinder_qty,
              cylinder_fee: item.cylinder_fee,
            })),
          },
        },
        include: { customer: true, items: { include: { product: true } } },
      });

      // Both numbers derive from the delivery id so they stay unique and sequential.
      const referenceNo = buildDeliveryRef(delivery.delivery_id, delivery.created_at);
      const salesOrderNo = buildSalesOrderNo(delivery.delivery_id, delivery.created_at);
      const result = await tx.delivery.update({
        where: { delivery_id: delivery.delivery_id },
        data: { reference_no: referenceNo, sales_order_no: salesOrderNo },
        include: { customer: true, items: { include: { product: true } } },
      });

      await writeAuditLog(tx, {
        user: session,
        action: "DELIVERY_CREATE",
        module: "Delivery",
        details: `Created delivery ${referenceNo} for ${delivery.customer.name}`,
      });
      return result;
    });

    return NextResponse.json({ success: true, order: serialize(withRefs) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Delivery creation error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
