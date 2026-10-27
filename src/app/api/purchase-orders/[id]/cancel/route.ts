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
    const po_id = Number(id);

    const order = await db.purchaseOrder.findUnique({
      where: { po_id },
      include: { supplier: true, items: true },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Anything already received has moved stock; cancelling then would leave
    // the count overstated with no paper trail to reverse it.
    const receivedLines = order.items.filter((i) => i.received_qty > 0).length;
    if (order.status === "received" || receivedLines > 0) {
      return NextResponse.json(
        {
          error:
            "This order has already been received into stock, so it can no longer be cancelled.",
        },
        { status: 409 },
      );
    }
    if (order.status === "cancelled") {
      return NextResponse.json({ error: "Already cancelled." }, { status: 400 });
    }

    const updated = await db.purchaseOrder.update({
      where: { po_id },
      data: { status: "cancelled", cancelled_at: new Date() },
      include: { supplier: true, items: { include: { product: true } } },
    });

    await writeAuditLog(db, {
      user: session,
      action: "PO_CANCEL",
      module: "Purchase Orders",
      details: `Cancelled ${order.reference_no ?? `PO #${po_id}`} for ${order.supplier.name}`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
