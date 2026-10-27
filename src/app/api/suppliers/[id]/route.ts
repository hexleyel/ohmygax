import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const supplier_id = Number(id);

    const updated = await db.supplier.update({
      where: { supplier_id },
      data: {
        name: body.name,
        contact_person: body.contact_person,
        phone: body.phone,
        email: body.email || null,
        address: body.address,
        status: body.status,
      },
    });

    if (Array.isArray(body.product_ids)) {
      await db.productSupplier.deleteMany({ where: { supplier_id } });
      await db.productSupplier.createMany({
        data: body.product_ids.map((product_id: number) => ({
          product_id: Number(product_id),
          supplier_id,
        })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog(db, {
      user: session,
      action: "SUPPLIER_UPDATE",
      module: "Supplier Management",
      details: `Updated supplier ${updated.name}`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const status = body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : null;
    if (!status) {
      return NextResponse.json({ error: "Status must be active or inactive" }, { status: 400 });
    }

    const updated = await db.supplier.update({
      where: { supplier_id: Number(id) },
      data: { status },
    });

    await writeAuditLog(db, {
      user: session,
      action: status === "inactive" ? "SUPPLIER_ARCHIVE" : "SUPPLIER_REACTIVATE",
      module: "Supplier Management",
      details: `${status === "inactive" ? "Archived" : "Reactivated"} supplier ${updated.name}`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Supplier status update error:", error);
    return NextResponse.json({ error: "Failed to update supplier status" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const updated = await db.supplier.update({
      where: { supplier_id: Number(id) },
      data: { status: "inactive" },
    });

    await writeAuditLog(db, {
      user: session,
      action: "SUPPLIER_ARCHIVE",
      module: "Supplier Management",
      details: `Deactivated supplier ${updated.name}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
