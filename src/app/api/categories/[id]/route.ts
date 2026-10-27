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
    const category_id = Number(id);

    if (!Number.isInteger(category_id) || category_id <= 0) {
      return NextResponse.json({ error: "Invalid category ID." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A category update payload is required." }, { status: 400 });
    }

    const existing = await db.category.findUnique({ where: { category_id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }
    const nextName = body.name !== undefined ? body.name.trim() : existing.name;
    const nameConflict = await db.category.findFirst({
      where: {
        name: nextName,
        category_id: { not: category_id },
      },
      select: { category_id: true },
    });
    if (nameConflict) {
      return NextResponse.json(
        { error: "A category with this name already exists." },
        { status: 409 },
      );
    }
    const isCylinder = body.isCylinder ?? body.is_cylinder;
    if (isCylinder !== undefined && typeof isCylinder !== "boolean") {
      return NextResponse.json({ error: "Is Cylinder Category must be true or false." }, { status: 400 });
    }

    const nextStatus = body.status ?? existing.status;
    if (nextStatus !== "active" && nextStatus !== "archived") {
      return NextResponse.json({ error: "Status must be active or archived." }, { status: 400 });
    }
    if (nextStatus === "archived") {
      const activeProducts = await db.product.count({
        where: { category: existing.code, status: "active" },
      });
      if (activeProducts > 0) {
        return NextResponse.json(
          { error: "Cannot archive: Category contains active products." },
          { status: 409 },
        );
      }
    }

    // The code is what products store, so renaming the label is safe but
    // re-keying it is not — the code stays fixed for the life of the row.
    const updated = await db.category.update({
      where: { category_id },
      data: {
        name: nextName,
        is_cylinder: isCylinder ?? existing.is_cylinder,
        status: nextStatus,
      },
    });

    await writeAuditLog(db, {
      user: session,
      action: nextStatus === "archived"
        ? "CATEGORY_ARCHIVE"
        : nextStatus === "active" && existing.status === "archived"
          ? "CATEGORY_RESTORE"
          : "CATEGORY_UPDATE",
      module: "File Maintenance",
      details: `Updated category ${updated.name}`,
    });

    return NextResponse.json({
      success: true,
      category: serialize({
        ...updated,
        isCylinder: updated.is_cylinder,
        isArchived: updated.status === "archived",
      }),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Category update failed:", error);
    const prismaCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    const message = prismaCode === "P2025"
      ? "Category no longer exists. Refresh the list and try again."
      : prismaCode === "P2002"
        ? "A category with this name or code already exists."
        : "Failed to update category. Please check the values and try again.";
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" ? { detail } : {}),
      },
      { status: prismaCode === "P2025" ? 404 : prismaCode === "P2002" ? 409 : 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const category_id = Number(id);

    const existing = await db.category.findUnique({ where: { category_id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const inUse = await db.product.count({ where: { category: existing.code, status: "active" } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: "Cannot archive: Category contains active products.",
        },
        { status: 409 },
      );
    }

    await db.category.update({ where: { category_id }, data: { status: "archived" } });

    await writeAuditLog(db, {
      user: session,
      action: "CATEGORY_ARCHIVE",
      module: "File Maintenance",
      details: `Archived category ${existing.name}`,
    });

    return NextResponse.json({ success: true, status: "archived", isArchived: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Category archive error:", error);
    return NextResponse.json(
      { error: "Failed to archive category." },
      { status: 500 },
    );
  }
}
