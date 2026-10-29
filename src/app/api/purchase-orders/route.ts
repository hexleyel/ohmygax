import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { buildPurchaseOrderNo } from "@/lib/reference";
import { serialize } from "@/lib/serialize";
import { duplicateProductIds } from "@/lib/receiving";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const receivableOnly = searchParams.get("receivableOnly") === "1";
    // Default to recent orders; consumers can request full history with all=1.
    const limitParam = Number(searchParams.get("limit"));
    const take = searchParams.get("all") === "1"
      ? undefined
      : Number.isFinite(limitParam) && limitParam > 0
        ? limitParam
        : 5;

    const orders = await db.purchaseOrder.findMany({
      where: receivableOnly
        ? { status: { notIn: ["issued", "cancelled"] } }
        : status && status !== "all"
          ? { status }
          : undefined,
      include: {
        supplier: true,
        items: { include: { product: true } },
        createdBy: { select: { full_name: true, role: true } },
      },
      orderBy: { order_date: "desc" },
      take,
    });
    return NextResponse.json(serialize(orders));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("LIST_PURCHASE_ORDERS_ERROR:", error);
    return NextResponse.json(
      { error: "Unable to load purchase orders. Check the server logs for details." },
      { status: 500 },
    );
  }
}

type POItem = { product_id: number; quantity: number; unit_cost: number };

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const items: POItem[] = Array.isArray(body.items) ? body.items : [];

    // One line per product: merging is the caller's job, and a duplicate here
    // almost always means the same item was picked twice by mistake. Compared
    // by product id, never by name.
    if (duplicateProductIds(items).length > 0) {
      return NextResponse.json(
        { error: "The same product appears on more than one line." },
        { status: 400 },
      );
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const deliveryDate = typeof body.estimated_delivery === "string"
      ? new Date(`${body.estimated_delivery}T00:00:00.000Z`)
      : null;
    if (!deliveryDate || Number.isNaN(deliveryDate.getTime()) || deliveryDate.toISOString().slice(0, 10) !== body.estimated_delivery) {
      return NextResponse.json({ error: "Choose a valid estimated delivery date." }, { status: 400 });
    }

    const total_amount = items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_cost),
      0,
    );

    const order = await db.purchaseOrder.create({
      data: {
        supplier_id: Number(body.supplier_id),
        estimated_delivery: deliveryDate,
        total_amount,
        status: "issued",
        created_by: session.user_id,
        items: {
          create: items.map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
            unit_cost: Number(item.unit_cost),
          })),
        },
      },
      include: { supplier: true, items: { include: { product: true } } },
    });

    // Derived from the id so PO numbers are unique and sequential.
    const referenceNo = buildPurchaseOrderNo(order.po_id, order.order_date);
    const withRef = await db.purchaseOrder.update({
      where: { po_id: order.po_id },
      data: { reference_no: referenceNo },
      include: { supplier: true, items: { include: { product: true } } },
    });

    await writeAuditLog(db, {
      user: session,
      action: "PO_CREATE",
      module: "Purchase Orders",
      details: `Created ${referenceNo} for ${order.supplier.name} — ₱${total_amount.toFixed(2)}`,
    });

    return NextResponse.json(
      { success: true, data: serialize(withRef) },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("CREATE_PURCHASE_ORDER_ERROR:", error);
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { success: false, error: message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
