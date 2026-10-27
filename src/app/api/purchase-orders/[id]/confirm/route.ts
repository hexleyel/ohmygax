import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const poId = Number(id);
    const order = await db.purchaseOrder.findUnique({
      where: { po_id: poId },
      include: { items: true },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (order.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending orders can be confirmed." },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedItems = body?.items;
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > order.items.length) {
      return NextResponse.json({ error: "Keep at least one valid purchase order item." }, { status: 400 });
    }

    const submittedItems = new Map<number, { product_id: number; quantity: number; unit_cost: number }>();
    for (const item of requestedItems) {
      const itemId = Number(item?.item_id);
      const productId = Number(item?.product_id);
      const quantity = Number(item?.quantity);
      const unitCost = Number(item?.unit_cost);
      if (!Number.isInteger(itemId) || !Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitCost) || unitCost < 0 || submittedItems.has(itemId)) {
        return NextResponse.json({ error: "Each item needs a product, positive whole-number quantity, and valid unit price." }, { status: 400 });
      }
      submittedItems.set(itemId, { product_id: productId, quantity, unit_cost: unitCost });
    }
    if ([...submittedItems.keys()].some((itemId) => !order.items.some((item) => item.id === itemId))) {
      return NextResponse.json({ error: "The submitted items do not match this purchase order." }, { status: 400 });
    }
    const productIds = [...new Set([...submittedItems.values()].map((item) => item.product_id))];
    const activeProducts = await db.product.findMany({ where: { product_id: { in: productIds }, status: "active" }, select: { product_id: true } });
    if (activeProducts.length !== productIds.length) {
      return NextResponse.json({ error: "One or more selected products are no longer active." }, { status: 400 });
    }

    const totalAmount = [...submittedItems.values()].reduce((sum, item) => {
      return sum + item.unit_cost * item.quantity;
    }, 0);

    const confirmed = await db.$transaction(async (tx) => {
      for (const item of order.items) {
        const submitted = submittedItems.get(item.id)!;
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { product_id: submitted.product_id, quantity: submitted.quantity, unit_cost: submitted.unit_cost },
        });
      }
      const removedIds = order.items.filter((item) => !submittedItems.has(item.id)).map((item) => item.id);
      if (removedIds.length) {
        await tx.purchaseOrderItem.deleteMany({ where: { id: { in: removedIds }, po_id: poId } });
      }
      return tx.purchaseOrder.update({
        where: { po_id: poId },
        data: { status: "confirmed", total_amount: totalAmount },
        include: { supplier: true, items: { include: { product: true } } },
      });
    });

    await writeAuditLog(db, {
      user: session,
      action: "PO_CONFIRM",
      module: "Purchase Orders",
      details: `Confirmed ${order.reference_no || `PO #${order.po_id}`}`,
    });

    return NextResponse.json(serialize(confirmed));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
