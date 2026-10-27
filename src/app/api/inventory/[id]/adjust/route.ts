import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { InsufficientStockError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { stockTierQuantities, type StockTier } from "@/lib/stockTiers";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const product_id = Number(id);
    const bodyProductId = body.productId === undefined ? product_id : Number(body.productId);
    const deductionQuantity = Math.abs(Number(body.adjustmentQuantity ?? body.adjustment ?? body.delta));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const rawStockType = body.stockTier ?? body.stock_type ?? body.tier;
    const normalizedStockType = typeof rawStockType === "string" ? rawStockType.toLowerCase() : "";
    const stockType = normalizedStockType === "new" || normalizedStockType === "old"
      ? normalizedStockType as StockTier
      : null;

    if (
      !Number.isInteger(product_id) ||
      product_id <= 0 ||
      bodyProductId !== product_id ||
      !Number.isInteger(deductionQuantity) ||
      deductionQuantity <= 0 ||
      !stockType ||
      !reason
    ) {
      return NextResponse.json(
        { error: "A matching product ID, stock tier, positive whole-number deduction, and reason are required." },
        { status: 400 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { product_id } });
      if (!product) throw new Error("Product not found");

      const tiers = stockTierQuantities(product);
      const selectedQty = stockType === "new" ? tiers.newStock : tiers.oldStock;
      if (selectedQty < deductionQuantity) {
        throw new InsufficientStockError(product.name);
      }

      const deduction = -deductionQuantity;
      const nextNew = tiers.newStock + (stockType === "new" ? deduction : 0);
      const nextOld = tiers.oldStock + (stockType === "old" ? deduction : 0);
      const stockUpdate = await tx.product.updateMany({
        where: { product_id, stock_qty: product.stock_qty },
        data: {
          stock_qty: { increment: deduction },
          new_stock_qty: nextNew,
          old_stock_qty: nextOld,
        },
      });

      if (stockUpdate.count === 0) {
        throw new InsufficientStockError(product.name);
      }

      const updatedProduct = await tx.product.findUniqueOrThrow({ where: { product_id } });
      const tierLabel = stockType === "new" ? "New Stocks" : "Old Stocks";

      await tx.inventoryLog.create({
        data: {
          product_id,
          change_type: "adjustment",
          quantity: deduction,
          // InventoryLog.reason is VARCHAR(255). Keep the tier prefix intact
          // while ensuring a long optional note cannot reject the stock write.
          reason: `${tierLabel}${reason ? `: ${reason}` : ""}`.slice(0, 255),
        },
      });

      return updatedProduct;
    });

    // Audit history is supplementary. A missing/stale user relation in the
    // audit table must not roll back a successful inventory update and log.
    try {
      await writeAuditLog(db, {
        user: session,
        action: "STOCK_ADJUST",
        module: "Stock Adjustment",
        details: `${deductionQuantity} deducted from ${stockType === "new" ? "New Stocks" : "Old Stocks"} - ${updated.name}${reason ? ` - ${reason}` : ""}`,
      });
    } catch (auditError) {
      console.error("Stock adjustment audit log failed:", auditError);
    }

    return NextResponse.json(
      { success: true, message: "Adjustment saved successfully", product: serialize(updated) },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `Adjustment would take ${error.message.replace("Insufficient stock for ", "")} below zero stock` },
        { status: 409 },
      );
    }
    console.error("Stock adjustment failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
