import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";
import { stockTierQuantities } from "@/lib/stockTiers";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    requireAuth(req, "admin");
    const { id } = await params;
    const productId = Number(id);
    const body = await req.json();
    const quantity = Number(body.quantity);

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "A product and positive whole-number quantity are required." }, { status: 400 });
    }

    const product = await db.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { product_id: productId } });
      if (!current) throw new Error("Product not found.");

      const tiers = stockTierQuantities(current);
      if (quantity > tiers.newStock) {
        throw new Error(`Only ${tiers.newStock} units are available in Reserve Qty.`);
      }

      const update = await tx.product.updateMany({
        where: {
          product_id: productId,
          stock_qty: current.stock_qty,
          new_stock_qty: current.new_stock_qty,
          old_stock_qty: current.old_stock_qty,
        },
        data: {
          new_stock_qty: tiers.newStock - quantity,
          old_stock_qty: tiers.oldStock + quantity,
        },
      });
      if (update.count === 0) throw new Error("Stock changed while confirming. Refresh and try again.");

      await tx.inventoryLog.create({
        data: {
          product_id: productId,
          change_type: "transfer",
          quantity,
          reason: "Reserve (New Stocks) to Active (Old Stocks)",
        },
      });

      return tx.product.findUniqueOrThrow({ where: { product_id: productId } });
    });

    return NextResponse.json({ success: true, product: serialize(product) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reserve to active stock transfer failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to transfer stock." },
      { status: 500 },
    );
  }
}
