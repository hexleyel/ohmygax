import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const requestedStatus = req.nextUrl.searchParams.get("status");
    const status = requestedStatus === "archived" ? "archived" : "active";
    const uoms = await db.uom.findMany({
      where: { status },
      orderBy: { code: "asc" },
    });

    const counts = await db.product.groupBy({
      by: ["uom"],
      where: { status: "active" },
      _count: { _all: true },
    });
    const usage = new Map(counts.map((c) => [c.uom, c._count._all]));

    return NextResponse.json(
      serialize(uoms.map((u) => ({ ...u, product_count: usage.get(u.code) ?? 0 }))),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const code = String(body.code ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();

    if (!code || !name) {
      return NextResponse.json(
        { error: "Both a short code and a name are required." },
        { status: 400 },
      );
    }

    const clash = await db.uom.findUnique({ where: { code } });
    if (clash) {
      return NextResponse.json({ error: `"${code}" already exists.` }, { status: 409 });
    }

    const uom = await db.uom.create({ data: { code, name } });

    await writeAuditLog(db, {
      user: session,
      action: "UOM_CREATE",
      module: "File Maintenance",
      details: `Created unit of measurement ${uom.code} — ${uom.name}`,
    });

    return NextResponse.json(serialize(uom), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
