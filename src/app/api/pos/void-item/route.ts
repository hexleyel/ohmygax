import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

/**
 * Records a cart line being voided before checkout.
 *
 * The cart lives only in the browser, so there is no transaction to attach
 * this to — but a cashier repeatedly removing items is exactly the kind of
 * thing the audit trail exists to surface. The log message is built from the
 * product row on the server so the client can't submit arbitrary text.
 */
export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();
    const product_id = Number(body.product_id);
    const quantity = Number(body.quantity);

    if (!Number.isInteger(product_id) || product_id <= 0) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }

    const product = await db.product.findUnique({
      where: { product_id },
      select: { name: true, sku: true, selling_price: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const qty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    const lineValue = Number(product.selling_price) * qty;

    await writeAuditLog(db, {
      user: session,
      action: "ITEM_VOID",
      module: "Point of Sale",
      details: `Voided ${qty} × ${product.name} (${product.sku}) from cart — ₱${lineValue.toFixed(2)}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
