import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { reclassifyCustomer } from "@/lib/customerClassification";
import { ConflictError, InsufficientStockError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { cylinderCategoryCodes } from "@/lib/categories";
import { consumeStockTiers, stockTierQuantities } from "@/lib/stockTiers";
import { loadSettings } from "@/lib/settings";
import { calculateVatAmount } from "@/lib/calc";
import type { Prisma } from "@/generated/prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req);
    const delivery_id = Number(id);
    const body = await req.json().catch(() => ({}));
    const amountReceived = Number(body.amount_received);
    const emptyCylindersReturned = Number(body.empty_cylinders_returned);
    if (!Number.isFinite(amountReceived) || amountReceived < 0) {
      return NextResponse.json({ error: "Enter a valid amount received." }, { status: 400 });
    }
    if (!Number.isInteger(emptyCylindersReturned) || emptyCylindersReturned < 0) {
      return NextResponse.json({ error: "Enter a whole number of returned cylinders." }, { status: 400 });
    }
    const requestedSessionId = Number(body.session_id);

    let activeShift = await db.cashSession.findFirst({
      where: {
        status: "open",
        ...(Number.isInteger(requestedSessionId) && requestedSessionId > 0
          ? { session_id: requestedSessionId }
          : {}),
      },
      orderBy: { opened_at: "desc" },
    });
    if (!activeShift && Number.isInteger(requestedSessionId) && requestedSessionId > 0) {
      activeShift = await db.cashSession.findFirst({
        where: { status: "open" },
        orderBy: { opened_at: "desc" },
      });
    }
    console.log("Backend Shift Query Result:", activeShift);
    if (!activeShift) {
      return NextResponse.json({ error: "No open shift found. Please open a cash shift in Cash Management or POS before processing deliveries." }, { status: 400 });
    }
    const activeSessionId = activeShift.session_id;
    const settings = await loadSettings();

    const delivery = await db.delivery.findUnique({
      where: { delivery_id },
      include: { customer: true, items: { include: { product: true } } },
    });
    if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (delivery.status === "completed") {
      return NextResponse.json({ error: "Delivery is already completed" }, { status: 400 });
    }
    if (delivery.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot complete a cancelled delivery" },
        { status: 400 },
      );
    }
    const cylinderCodes = await cylinderCategoryCodes();
    const cylinderItems = delivery.items.filter((item) => cylinderCodes.has(item.product.category));
    const maxReturnedCylinders = cylinderItems.reduce((sum, item) => sum + item.quantity, 0);
    if (emptyCylindersReturned > maxReturnedCylinders) {
      return NextResponse.json({ error: `Returned cylinders cannot exceed the ${maxReturnedCylinders} cylinders in this delivery.` }, { status: 400 });
    }
    const cylinderFeeRate = Number.isFinite(settings.cylinderFee) ? settings.cylinderFee : 150;
    const subtotal = Number(delivery.items.reduce((sum, item) => sum + Number(item.product.selling_price) * item.quantity, 0).toFixed(2));
    const cylinderFee = Number(((maxReturnedCylinders - emptyCylindersReturned) * cylinderFeeRate).toFixed(2));
    const total = Number((subtotal + cylinderFee).toFixed(2));
    if (amountReceived < total) {
      return NextResponse.json({ error: "Amount received is less than the total amount due." }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const currentShift = await tx.cashSession.findFirst({
        where: { session_id: activeSessionId, status: "open" },
      });
      if (!currentShift) throw new ConflictError("No open shift found. Please open a cash shift in Cash Management or POS before processing deliveries.");
      // Re-check status inside the transaction so two concurrent completion
      // requests can't both pass the check above and both deduct stock.
      const guarded = await tx.delivery.updateMany({
        where: { delivery_id, status: { in: ["pending", "in_transit"] } },
        data: { status: "completed", completed_at: new Date(), session_id: currentShift.session_id, total_amount: total },
      });
      if (guarded.count === 0) {
        throw new ConflictError("Delivery is no longer completable");
      }

      let cylindersLeftToReturn = emptyCylindersReturned;

      for (const item of delivery.items) {
        const isCylinder = cylinderCodes.has(item.product.category);

        const currentStock = await tx.product.findUniqueOrThrow({
          where: { product_id: item.product_id },
        });
        const tiers = stockTierQuantities(currentStock);
        if (currentStock.stock_qty < item.quantity) {
          throw new InsufficientStockError(item.product.name);
        }
        const nextTiers = consumeStockTiers(tiers, item.quantity);
        const stockUpdate = await tx.product.updateMany({
          where: { product_id: item.product_id, stock_qty: currentStock.stock_qty },
          data: {
            stock_qty: { decrement: item.quantity },
            new_stock_qty: nextTiers.newStock,
            old_stock_qty: nextTiers.oldStock,
            ...(isCylinder ? { full_qty: { decrement: item.quantity } } : {}),
          },
        });
        if (stockUpdate.count === 0) {
          throw new InsufficientStockError(item.product.name);
        }

        await tx.inventoryLog.create({
          data: {
            product_id: item.product_id,
            change_type: "out",
            quantity: item.quantity,
            reason: `Delivery #${delivery_id} completed`,
            ref_type: "delivery",
            ref_id: delivery_id,
          },
        });
        if (isCylinder && cylindersLeftToReturn > 0) {
          const returnedQty = Math.min(item.quantity, cylindersLeftToReturn);
          await tx.product.update({
            where: { product_id: item.product_id },
            data: { empty_qty: { increment: returnedQty } },
          });
          await tx.inventoryLog.create({
            data: {
              product_id: item.product_id,
              change_type: "empty_return",
              quantity: returnedQty,
              reason: `Empty cylinders returned for delivery #${delivery_id}`,
              ref_type: "delivery",
              ref_id: delivery_id,
            },
          });
          cylindersLeftToReturn -= returnedQty;
        }
      }

      const result = await tx.delivery.findUniqueOrThrow({
        where: { delivery_id },
        include: { customer: true, items: { include: { product: true } } },
      });

      const vat = calculateVatAmount(subtotal, settings.vatRate);
      const transactionData: Prisma.TransactionUncheckedCreateInput = {
        user_id: session.user_id,
        subtotal,
        cylinder_fee: cylinderFee,
        vat_amount: vat,
        total_amount: total,
        payment_method: delivery.payment_method === "gcash" ? "gcash" : "cash",
        cash_received: delivery.payment_method === "gcash" ? 0 : amountReceived,
        change_amount: delivery.payment_method === "gcash" ? 0 : Number((amountReceived - total).toFixed(2)),
        gcash_mobile: delivery.gcash_mobile,
        gcash_reference: delivery.gcash_reference,
        session_id: currentShift.session_id,
        source_delivery_id: delivery.delivery_id,
        reference_no: delivery.reference_no,
      };
      const transaction = await tx.transaction.create({ data: transactionData });
      for (const item of delivery.items) {
        const lineTotal = Number((Number(item.product.selling_price) * item.quantity).toFixed(2));
        await tx.transactionDetail.create({
          data: {
            transaction_id: transaction.transaction_id,
            product_id: item.product_id,
            quantity: item.quantity,
            price: Number(item.product.selling_price),
            subtotal: lineTotal,
            without_cylinder: Number(item.without_cylinder_qty) > 0,
            without_cylinder_qty: item.without_cylinder_qty,
          },
        });
      }

      await reclassifyCustomer(tx, delivery.customer_id);

      await writeAuditLog(tx, {
        user: session,
        action: "DELIVERY_COMPLETE",
        module: "Delivery",
        details: `Completed delivery #${delivery_id} for ${delivery.customer.name}`,
      });

      return result;
    });

    return NextResponse.json({
      success: true,
      message: "Delivery completed",
      delivery: serialize(updated),
    });
  } catch (error) {
    console.error("Delivery Complete Error:", error);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("No open shift") ? 400 : 409 });
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
