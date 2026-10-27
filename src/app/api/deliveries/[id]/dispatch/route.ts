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

    // Only a pending delivery can be dispatched.
    try {
      await db.delivery.update({
        where: { delivery_id, status: "pending" },
        data: { status: "in_transit" },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025"
      ) {
        const existing = await db.delivery.findUnique({ where: { delivery_id } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(
          { error: `Delivery cannot be dispatched from status "${existing.status}"` },
          { status: 409 },
        );
      }
      throw error;
    }

    const updated = await db.delivery.findUniqueOrThrow({
      where: { delivery_id },
      include: { customer: true },
    });

    await writeAuditLog(db, {
      user: session,
      action: "DELIVERY_DISPATCH",
      module: "Delivery",
      details: `Dispatched delivery #${delivery_id} to ${updated.customer.name}`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
