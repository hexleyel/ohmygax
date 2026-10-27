import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";
import { stockTierQuantities } from "@/lib/stockTiers";

type RouteParams = { params: Promise<{ logId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    requireAuth(req, "admin");
    const { logId: rawLogId } = await params;
    const logId = Number(rawLogId);
    if (!Number.isInteger(logId) || logId <= 0) {
      return NextResponse.json({ error: "Invalid adjustment history entry." }, { status: 400 });
    }

    const restored = await db.$transaction(async (tx) => {
      const entry = await tx.inventoryLog.findUnique({ where: { log_id: logId } });
      if (!entry || entry.change_type !== "adjustment" || entry.quantity >= 0) {
        throw new Error("This entry is not an active stock deduction.");
      }
      const isOld = entry.reason?.startsWith("Old Stocks");
      const isNew = entry.reason?.startsWith("New Stocks");
      if (!isOld && !isNew) throw new Error("The stock tier for this deduction was not recorded.");
      if (entry.ref_type === "restored") throw new Error("This deduction has already been restored.");

      // Claim the original history row in the same transaction to prevent
      // repeated or concurrent restore requests from crediting stock twice.
      const claim = await tx.inventoryLog.updateMany({
        where: { log_id: logId, ref_type: null, quantity: { lt: 0 } },
        data: { ref_type: "restored" },
      });
      if (claim.count !== 1) throw new Error("This deduction has already been restored.");

      const product = await tx.product.findUniqueOrThrow({ where: { product_id: entry.product_id } });
      const tiers = stockTierQuantities(product);
      const quantity = Math.abs(entry.quantity);
      const nextNew = tiers.newStock + (isNew ? quantity : 0);
      const nextOld = tiers.oldStock + (isOld ? quantity : 0);
      const update = await tx.product.updateMany({
        where: {
          product_id: product.product_id,
          stock_qty: product.stock_qty,
          new_stock_qty: product.new_stock_qty,
          old_stock_qty: product.old_stock_qty,
        },
        data: {
          stock_qty: { increment: quantity },
          new_stock_qty: nextNew,
          old_stock_qty: nextOld,
        },
      });
      if (update.count !== 1) throw new Error("Stock changed while restoring. Refresh and try again.");

      await tx.inventoryLog.create({
        data: {
          product_id: product.product_id,
          change_type: "in",
          quantity,
          reason: `Restored deduction #${logId}`,
          ref_type: "stock_adjustment_restore",
          ref_id: logId,
        },
      });
      return tx.product.findUniqueOrThrow({ where: { product_id: product.product_id } });
    });

    return NextResponse.json({ success: true, product: serialize(restored) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Stock adjustment restore failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore stock." },
      { status: 500 },
    );
  }
}
