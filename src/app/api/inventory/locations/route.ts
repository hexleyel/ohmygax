import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const rows = await db.product.findMany({
      where: { status: "active", location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    });
    return NextResponse.json(rows.map((row) => row.location).filter(Boolean));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Warehouse locations error:", error);
    return NextResponse.json({ error: "Failed to load warehouse locations." }, { status: 500 });
  }
}
