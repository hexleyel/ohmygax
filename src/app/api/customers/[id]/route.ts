import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    requireAuth(req);
    const customer = await db.customer.findUnique({
      where: { customer_id: Number(id) },
      include: { deliveries: { include: { items: { include: { product: true } } } } },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serialize(customer));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req);
    const body = await req.json();
    const customer_id = Number(id);

    const updated = await db.customer.update({
      where: { customer_id },
      data: {
        name: body.name,
        phone: body.phone,
        address: body.address,
        address_secondary: body.address_secondary || null,
        email: body.email || null,
        notes: body.notes || null,
        ...(body.type ? { type: body.type } : {}),
      },
    });

    await writeAuditLog(db, {
      user: session,
      action: "CUSTOMER_UPDATE",
      module: "Customer Management",
      details: `Updated customer ${updated.name}`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/**
 * Removes a customer. Refused once they have deliveries — history must stay
 * intact, so this is only for correcting a mistyped entry.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req);
    const customer_id = Number(id);

    const customer = await db.customer.findUnique({
      where: { customer_id },
      include: { _count: { select: { deliveries: true } } },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (customer._count.deliveries > 0) {
      return NextResponse.json(
        {
          error: `${customer.name} has ${customer._count.deliveries} delivery record(s) and can't be deleted. Edit the details instead.`,
        },
        { status: 409 },
      );
    }

    await db.customer.delete({ where: { customer_id } });

    await writeAuditLog(db, {
      user: session,
      action: "CUSTOMER_DELETE",
      module: "Customer Management",
      details: `Deleted customer ${customer.name}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
