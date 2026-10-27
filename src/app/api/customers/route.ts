import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const customers = await db.customer.findMany({
      include: { deliveries: true },
      orderBy: { name: "asc" },
    });

    const shaped = customers.map((c) => ({
      ...c,
      deliveries: undefined,
      deliveryCount: c.deliveries.length,
      activeDeliveryCount: c.deliveries.filter(
        (d) => d.status === "pending" || d.status === "in_transit",
      ).length,
      totalSpent: c.deliveries
        .filter((d) => d.status === "completed")
        .reduce((sum, d) => sum + Number(d.total_amount), 0),
    }));

    return NextResponse.json(serialize(shaped));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();

    const customer = await db.customer.create({
      data: {
        name: body.name,
        phone: body.phone,
        address: body.address,
        address_secondary: body.address_secondary || null,
        email: body.email || null,
        notes: body.notes || null,
        type: body.type === "bulk" ? "bulk" : "new",
      },
    });

    await writeAuditLog(db, {
      user: session,
      action: "CUSTOMER_CREATE",
      module: "Customer Management",
      details: `Added customer ${customer.name}`,
    });

    return NextResponse.json(serialize(customer), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
