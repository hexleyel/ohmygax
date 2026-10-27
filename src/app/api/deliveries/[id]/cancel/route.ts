import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req);
    const delivery_id = Number(id);

    // Completed deliveries already moved stock — cancelling them after the
    // fact would need a separate reversal flow, not a plain status flip.
    const guarded = await db.delivery.updateMany({
      where: { delivery_id, status: { in: ["pending", "in_transit"] } },
      data: { status: "cancelled" },
    });
    if (guarded.count === 0) {
      const existing = await db.delivery.findUnique({ where: { delivery_id } });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(
        { error: `Delivery cannot be cancelled from status "${existing.status}"` },
        { status: 409 },
      );
    }

    const updated = await db.delivery.findUniqueOrThrow({
      where: { delivery_id },
      include: { customer: true },
    });

    await writeAuditLog(db, {
      user: session,
      action: "DELIVERY_CANCEL",
      module: "Delivery",
      details: `Cancelled delivery #${delivery_id} for ${updated.customer.name}`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
