import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const uom_id = Number(id);

    const existing = await db.uom.findUnique({ where: { uom_id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const code = body.code !== undefined ? String(body.code).trim().toLowerCase() : existing.code;
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const status = body.status !== undefined ? String(body.status) : existing.status;
    if (!code || !name) {
      return NextResponse.json({ error: "Both a short code and a name are required." }, { status: 400 });
    }
    if (code.length > 20) {
      return NextResponse.json({ error: "The short code must be 20 characters or fewer." }, { status: 400 });
    }
    if (!["active", "archived"].includes(status)) {
      return NextResponse.json({ error: "Status must be active or archived." }, { status: 400 });
    }

    if (status === "archived" && existing.status !== "archived") {
      const activeProducts = await db.product.count({ where: { uom: existing.code, status: "active" } });
      if (activeProducts > 0) {
        return NextResponse.json(
          { error: "Cannot archive: This unit of measurement is currently assigned to active products." },
          { status: 409 },
        );
      }
    }

    const clash = await db.uom.findFirst({ where: { code, uom_id: { not: uom_id } } });
    if (clash) {
      return NextResponse.json({ error: `"${code}" already exists.` }, { status: 409 });
    }

    // Product.uom stores the code string instead of a foreign key. Update all
    // linked products in the same transaction to preserve their unit link.
    const updated = await db.$transaction(async (tx) => {
      if (code !== existing.code) {
        await tx.product.updateMany({
          where: { uom: existing.code },
          data: { uom: code },
        });
      }
      return tx.uom.update({ where: { uom_id }, data: { code, name, status } });
    });

    await writeAuditLog(db, {
      user: session,
      action: status !== existing.status
        ? status === "archived" ? "UOM_ARCHIVE" : "UOM_RESTORE"
        : "UOM_UPDATE",
      module: "File Maintenance",
      details: status !== existing.status
        ? `${status === "archived" ? "Archived" : "Restored"} unit of measurement ${updated.code}`
        : `Updated unit ${existing.code} to ${updated.code} (${updated.name})`,
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const uom_id = Number(id);

    const existing = await db.uom.findUnique({ where: { uom_id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const inUse = await db.product.count({ where: { uom: existing.code, status: "active" } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `${existing.code} is used by ${inUse} product(s) and can't be deleted.`,
        },
        { status: 409 },
      );
    }

    await db.uom.update({ where: { uom_id }, data: { status: "archived" } });

    await writeAuditLog(db, {
      user: session,
      action: "UOM_ARCHIVE",
      module: "File Maintenance",
      details: `Archived unit of measurement ${existing.code}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
