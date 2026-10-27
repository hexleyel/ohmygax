import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { cylinderCategoryCodes } from "@/lib/categories";
import { InsufficientStockError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { stockTierQuantities } from "@/lib/stockTiers";
import {
  deriveOrderStatus,
  isLineStatus,
  stockDelta,
  validateReceipt,
  type LineStatus,
} from "@/lib/receiving";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Receives ONE line of a purchase order.
 *
 * Goods arrive per product, not per order — a delivery can bring the 11kg
 * cylinders today and the 22kg ones next week — so each line carries its own
 * status, received quantity and discrepancy note. The order's own status is
 * then derived from its lines.
 *
 * Stock moves by the DELTA between what was already recorded against the line
 * and what is being recorded now, so saving the same line twice never
 * double-counts.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const po_id = Number(id);
    const body = await req.json();

    const item_id = Number(body.item_id);
    const status = String(body.status ?? "complete") as LineStatus;
    const note = String(body.note ?? "").trim();
    const location = typeof body.location === "string" ? body.location.trim() : undefined;

    const missing_qty = Number(body.missing_qty ?? 0);
    const damaged_qty = Number(body.damaged_qty ?? 0);
    const excess_qty = Number(body.excess_qty ?? 0);

    if (!isLineStatus(status)) {
      return NextResponse.json({ error: "Unknown receive status." }, { status: 400 });
    }
    if (location !== undefined && location.length > 80) {
      return NextResponse.json({ error: "Storage location must be 80 characters or fewer." }, { status: 400 });
    }

    const order = await db.purchaseOrder.findUnique({
      where: { po_id },
      include: { items: { include: { product: true } }, supplier: true },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "This order was cancelled and can no longer be received." },
        { status: 409 },
      );
    }

    const line = order.items.find((i) => i.id === item_id);
    if (!line) {
      return NextResponse.json({ error: "That line is not on this order." }, { status: 404 });
    }

    // A completed line brings in everything ordered unless a count was given.
    const requestedQty =
      body.received_qty === undefined || body.received_qty === null
        ? status === "complete"
          ? line.quantity
          : 0
        : Number(body.received_qty);

    if (!Number.isFinite(requestedQty) || requestedQty < 0) {
      return NextResponse.json(
        { error: "Received quantity must be zero or more." },
        { status: 400 },
      );
    }
    const problem = validateReceipt({
      orderedQty: line.quantity,
      receivedQty: requestedQty,
      missingQty: missing_qty,
      damagedQty: damaged_qty,
      excessQty: excess_qty,
      status,
      note,
    });
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    // Damaged units are excluded from sellable stock; the delta form means
    // re-saving the same line is a no-op rather than a second increment.
    const delta = stockDelta(
      { receivedQty: requestedQty, damagedQty: damaged_qty },
      { receivedQty: line.received_qty, damagedQty: line.damaged_qty },
    );

    const updated = await db.$transaction(async (tx) => {
      if (location !== undefined && status !== "pending") {
        await tx.product.update({
          where: { product_id: line.product_id },
          data: { location: location || null },
        });
      }
      if (delta !== 0) {
        const cylinderCodes = await cylinderCategoryCodes(tx);
        const isCylinder = cylinderCodes.has(line.product.category);
        const currentStock = await tx.product.findUniqueOrThrow({
          where: { product_id: line.product_id },
        });
        const tiers = stockTierQuantities(currentStock);
        const removedFromNew = delta < 0 ? Math.min(tiers.newStock, -delta) : 0;
        const nextTiers = delta > 0
          ? { newStock: tiers.newStock + delta, oldStock: tiers.oldStock }
          : {
              newStock: tiers.newStock - removedFromNew,
              oldStock: tiers.oldStock - (-delta - removedFromNew),
            };
        if (currentStock.stock_qty + delta < 0) {
          throw new InsufficientStockError(line.product.name);
        }

        const stockUpdate = await tx.product.updateMany({
          where: { product_id: line.product_id, stock_qty: currentStock.stock_qty },
          data: {
            stock_qty: { increment: delta },
            new_stock_qty: nextTiers.newStock,
            old_stock_qty: nextTiers.oldStock,
            ...(delta > 0 ? { last_restocked_at: new Date() } : {}),
            ...(isCylinder ? { full_qty: { increment: delta } } : {}),
          },
        });
        if (stockUpdate.count === 0) {
          throw new InsufficientStockError(line.product.name);
        }

        await tx.inventoryLog.create({
          data: {
            product_id: line.product_id,
            change_type: delta > 0 ? "in" : "adjustment",
            quantity: Math.abs(delta),
            reason:
              `${delta > 0 ? "Received" : "Corrected"} on ${order.reference_no ?? `PO #${po_id}`}` +
              `${damaged_qty ? ` (${damaged_qty} damaged, not stocked)` : ""}` +
              `${note ? ` — ${note}` : ""}`,
            ref_type: "purchase_order",
            ref_id: po_id,
          },
        });
      }

      await tx.purchaseOrderItem.update({
        where: { id: item_id },
        data: {
          received_qty: requestedQty,
          missing_qty,
          damaged_qty,
          excess_qty,
          receive_status: status,
          receive_note: note || null,
          received_at: status === "pending" ? null : new Date(),
        },
      });

      // Roll the line states up into the order's own status.
      const lines = await tx.purchaseOrderItem.findMany({ where: { po_id } });
      const orderStatus = deriveOrderStatus(lines);
      const allComplete = orderStatus === "received";

      const result = await tx.purchaseOrder.update({
        where: { po_id },
        data: {
          status: orderStatus,
          received_at: allComplete ? new Date() : null,
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
          createdBy: { select: { full_name: true, role: true } },
        },
      });

      const discrepancy = [
        missing_qty ? `${missing_qty} missing` : null,
        damaged_qty ? `${damaged_qty} damaged` : null,
        excess_qty ? `${excess_qty} excess` : null,
      ]
        .filter(Boolean)
        .join(", ");

      await writeAuditLog(tx, {
        user: session,
        action: status === "back-order" ? "PO_RECEIVE_BACK_ORDER" : "PO_RECEIVE_LINE",
        module: "Receive Orders",
        details:
          `${order.reference_no ?? `PO #${po_id}`} · ${line.product.name} — ` +
          `${status} (${requestedQty}/${line.quantity})` +
          `${discrepancy ? ` · ${discrepancy}` : ""}${note ? ` · ${note}` : ""}`,
      });

      return result;
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
