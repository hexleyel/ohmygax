import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

/** Turns "Gas Cylinder" into "gas-cylinder" so the code is URL/query safe. */
function toCode(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") ?? "active";
    const where = statusFilter === "all"
      ? undefined
      : { status: statusFilter === "archived" ? "archived" : "active" };

    const categories = await db.category.findMany({
      where,
      orderBy: { name: "asc" },
    });

    const counts = await db.product.groupBy({
      by: ["category"],
      where: { status: "active" },
      _count: { _all: true },
    });
    const usage = new Map(counts.map((c) => [c.category, c._count._all]));

    return NextResponse.json(
      serialize(
        categories.map((c) => ({
          ...c,
          isArchived: c.status === "archived",
          product_count: usage.get(c.code) ?? 0,
        })),
      ),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Category list error:", error);
    return NextResponse.json({ error: "Failed to load categories." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }
    const isCylinder = body.isCylinder ?? body.is_cylinder;
    if (isCylinder !== undefined && typeof isCylinder !== "boolean") {
      return NextResponse.json({ error: "Is Cylinder Category must be true or false." }, { status: 400 });
    }
    const status = body.status ?? "active";
    if (status !== "active" && status !== "archived") {
      return NextResponse.json({ error: "Status must be active or archived." }, { status: 400 });
    }

    const code = toCode(name);
    if (!code) {
      return NextResponse.json(
        { error: "Category name must contain at least one letter or number." },
        { status: 400 },
      );
    }

    const clash = await db.category.findUnique({ where: { code } });
    if (clash) {
      return NextResponse.json(
        { error: `"${clash.name}" already exists.` },
        { status: 409 },
      );
    }

    const category = await db.category.create({
      data: {
        code,
        name,
        is_cylinder: isCylinder ?? false,
        status,
      },
    });

    await writeAuditLog(db, {
      user: session,
      action: "CATEGORY_CREATE",
      module: "File Maintenance",
      details: `Created category ${category.name}`,
    });

    return NextResponse.json(serialize({
      ...category,
      isArchived: category.status === "archived",
    }), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Category creation error:", error);
    return NextResponse.json(
      { error: "Failed to create category." },
      { status: 500 },
    );
  }
}
