import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const logs = await db.inventoryLog.findMany({
      where: {
        change_type: "adjustment",
        quantity: { lt: 0 },
        OR: [
          { reason: { startsWith: "New Stocks" } },
          { reason: { startsWith: "Old Stocks" } },
        ],
      },
      include: { product: { select: { name: true, sku: true, uom: true } } },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(
      serialize(
        logs.map((log) => ({
          log_id: log.log_id,
          product_name: log.product.name,
          sku: log.product.sku,
          uom: log.product.uom,
          stock_tier: log.reason?.startsWith("Old Stocks")
            ? "Old Stocks"
            : log.reason?.startsWith("New Stocks")
              ? "New Stocks"
              : "Not recorded",
          adjustment: log.quantity,
          reason: log.reason?.startsWith("New Stocks") || log.reason?.startsWith("Old Stocks")
            ? log.reason.replace(/^(New|Old) Stocks:?\s*/, "") || "—"
            : log.reason || "—",
          created_at: log.created_at,
          restored: log.ref_type === "restored",
          can_restore: log.ref_type === null,
        })),
      ),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Stock adjustment history failed:", error);
    return NextResponse.json({ error: "Failed to load stock adjustment history." }, { status: 500 });
  }
}
