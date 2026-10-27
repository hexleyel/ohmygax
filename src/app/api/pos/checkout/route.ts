import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { calculateCartTotals, type CartLine } from "@/lib/calc";
import { InsufficientStockError } from "@/lib/errors";
import { stockTierQuantities } from "@/lib/stockTiers";
import { buildReceiptNo } from "@/lib/reference";
import { normalizePhMobile, PH_MOBILE_HINT } from "@/lib/validation";
import { loadSettings } from "@/lib/settings";
import { serialize } from "@/lib/serialize";
import { cylinderCategoryCodes } from "@/lib/categories";

type CartItem = {
  product_id: number;
  quantity: number;
  without_cylinder_qty?: number;
};

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();
    const items: CartItem[] = Array.isArray(body.items) ? body.items : [];
    const paymentMethod: string = body.payment_method === "gcash" ? "gcash" : "cash";
    const seniorDiscount = Boolean(body.senior_discount);
    const cashReceived = body.cash_received !== undefined ? Number(body.cash_received) : null;

    if (items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return NextResponse.json(
          { error: `Invalid quantity for product ${item.product_id}` },
          { status: 400 },
        );
      }
    }

    const productIds = items.map((i) => Number(i.product_id));
    const products = await db.product.findMany({
      where: { product_id: { in: productIds }, status: "active" },
    });
    const productMap = new Map(products.map((p) => [p.product_id, p]));

    for (const item of items) {
      const product = productMap.get(Number(item.product_id));
      if (!product) {
        return NextResponse.json(
          { error: `Product ${item.product_id} not found` },
          { status: 400 },
        );
      }
      const availableOldStock = stockTierQuantities(product).oldStock;
      if (availableOldStock < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient Old Stocks for ${product.name}. Transfer New Stocks to Old Stocks before checkout.` },
          { status: 400 },
        );
      }
    }

    const settings = await loadSettings();

    const lines: CartLine[] = items.map((item) => {
      const product = productMap.get(Number(item.product_id))!;
      return {
        quantity: item.quantity,
        unitPrice: Number(product.selling_price),
        withoutCylinderQty: Number(item.without_cylinder_qty) || 0,
      };
    });

    const totals = calculateCartTotals(lines, {
      vatRate: settings.vatRate,
      cylinderFee: settings.cylinderFee,
      bulkDiscountThreshold: settings.bulkDiscountThreshold,
      bulkDiscountRate: settings.bulkDiscountRate,
      seniorDiscountRate: settings.seniorDiscountRate,
      seniorDiscount,
    });

    const changeAmount =
      paymentMethod === "cash" && cashReceived !== null
        ? Number((cashReceived - totals.total).toFixed(2))
        : null;

    // The GCash reference and sender's number come off the customer's own
    // confirmation, so they are captured at the till rather than generated —
    // an invented number would not reconcile against the GCash statement.
    const gcashReference =
      paymentMethod === "gcash" ? String(body.gcash_reference ?? "").trim() : null;
    const rawMobile =
      paymentMethod === "gcash" ? String(body.gcash_mobile ?? "").trim() : "";
    // Stored in the canonical 09XXXXXXXXX form regardless of how it was typed.
    const gcashMobile = paymentMethod === "gcash" ? normalizePhMobile(rawMobile) : null;

    if (paymentMethod === "gcash") {
      if (!gcashReference) {
        return NextResponse.json(
          { error: "Enter the GCash reference number from the customer's confirmation." },
          { status: 400 },
        );
      }
      if (!rawMobile) {
        return NextResponse.json(
          { error: "Enter the mobile number the GCash payment came from." },
          { status: 400 },
        );
      }
      if (!gcashMobile) {
        return NextResponse.json(
          { error: `That is not a valid Philippine mobile number. ${PH_MOBILE_HINT}` },
          { status: 400 },
        );
      }
    }

    // Cash must at least cover the total; a short payment would otherwise be
    // recorded as a completed sale with negative change.
    if (paymentMethod === "cash" && (cashReceived === null || cashReceived < totals.total)) {
      return NextResponse.json(
        { error: "Cash received is less than the total due." },
        { status: 400 },
      );
    }

    // Tie the sale to the cashier's open shift so Cash Management and the
    // X/Z reports can report on exactly that session.
    // A shift MUST be open — reject the sale if none exists so that no
    // transaction ever lands with a null session_id and goes unaccounted.
    const openSession = await db.cashSession.findFirst({
      where: { user_id: session.user_id, status: "open" },
      orderBy: { opened_at: "desc" },
    });

    if (!openSession) {
      return NextResponse.json(
        { error: "No open shift found. Please open a cash session before processing a sale." },
        { status: 400 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          user_id: session.user_id,
          subtotal: totals.subtotal,
          discount_amount: totals.discountAmount,
          cylinder_fee: totals.cylinderFee,
          vat_amount: totals.vatAmount,
          total_amount: totals.total,
          payment_method: paymentMethod,
          cash_received: cashReceived,
          change_amount: changeAmount,
          gcash_reference: gcashReference,
          gcash_mobile: gcashMobile,
          session_id: openSession.session_id,
        },
      });

      // Receipt number is derived from the transaction id, so it is unique
      // and sequential without needing a separate counter.
      const referenceNo = buildReceiptNo(
        transaction.transaction_id,
        transaction.transaction_date,
      );
      await tx.transaction.update({
        where: { transaction_id: transaction.transaction_id },
        data: { reference_no: referenceNo },
      });
      transaction.reference_no = referenceNo;

      const cylinderCodes = await cylinderCategoryCodes(tx);

      for (const item of items) {
        const product = productMap.get(Number(item.product_id))!;
        const price = Number(product.selling_price);
        const lineSubtotal = Number((price * item.quantity).toFixed(2));

        const isCylinder = cylinderCodes.has(product.category);
        // Clamp so a line can never claim more "no empty traded in" units than
        // it actually sold.
        const withoutQty = isCylinder
          ? Math.min(Math.max(Number(item.without_cylinder_qty) || 0, 0), item.quantity)
          : 0;
        // Units where the customer DID hand back an empty.
        const exchangedQty = isCylinder ? item.quantity - withoutQty : 0;

        await tx.transactionDetail.create({
          data: {
            transaction_id: transaction.transaction_id,
            product_id: product.product_id,
            quantity: item.quantity,
            price,
            subtotal: lineSubtotal,
            without_cylinder: withoutQty > 0,
            without_cylinder_qty: withoutQty,
          },
        });

        // Sell only from Old Stocks. Match both tier fields and total stock in
        // the update predicate so a concurrent sale or warehouse transfer
        // cannot consume the same available units twice.
        const currentStock = await tx.product.findUniqueOrThrow({
          where: { product_id: product.product_id },
        });
        const tiers = stockTierQuantities(currentStock);
        if (tiers.oldStock < item.quantity) {
          throw new InsufficientStockError(product.name);
        }
        const nextTiers = {
          newStock: tiers.newStock,
          oldStock: tiers.oldStock - item.quantity,
        };
        const stockUpdate = await tx.product.updateMany({
          where: {
            product_id: product.product_id,
            stock_qty: currentStock.stock_qty,
            new_stock_qty: currentStock.new_stock_qty,
            old_stock_qty: currentStock.old_stock_qty,
          },
          data: {
            stock_qty: { decrement: item.quantity },
            new_stock_qty: nextTiers.newStock,
            old_stock_qty: nextTiers.oldStock,
            ...(isCylinder
              ? {
                  full_qty: { decrement: item.quantity },
                  ...(exchangedQty > 0
                    ? { empty_qty: { increment: exchangedQty } }
                    : {}),
                }
              : {}),
          },
        });

        if (stockUpdate.count === 0) {
          throw new InsufficientStockError(product.name);
        }

        await tx.inventoryLog.create({
          data: {
            product_id: product.product_id,
            change_type: "out",
            quantity: item.quantity,
            reason: "POS sale",
            ref_type: "transaction",
            ref_id: transaction.transaction_id,
          },
        });

        // Distinct log entry for the physical empty cylinder handed back on
        // exchange, so reporting can tell "empty returns" apart from "PO
        // restocking" — both previously only showed up as change_type "in".
        if (exchangedQty > 0) {
          await tx.inventoryLog.create({
            data: {
              product_id: product.product_id,
              change_type: "empty_return",
              quantity: exchangedQty,
              reason: "Cylinder exchange — empty returned",
              ref_type: "transaction",
              ref_id: transaction.transaction_id,
            },
          });
        }
      }

      await writeAuditLog(tx, {
        user: session,
        action: "SALE",
        module: "Point of Sale",
        details: `Transaction #${transaction.transaction_id} — ₱${totals.total.toFixed(2)} via ${paymentMethod.toUpperCase()}`,
      });

      return transaction;
    });

    return NextResponse.json(
      serialize({
        transaction: result,
        totals,
        change_amount: changeAmount,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
