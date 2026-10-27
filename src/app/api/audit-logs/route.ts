import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const action = searchParams.get("action") || "";
    const role = searchParams.get("role") || "";

    const logs = await db.auditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(role ? { role: role as "admin" | "cashier" } : {}),
        ...(search
          ? {
              OR: [
                { details: { contains: search } },
                { module: { contains: search } },
                { action: { contains: search } },
              ],
            }
          : {}),
      },
      include: { user: { select: { username: true, full_name: true } } },
      orderBy: { created_at: "desc" },
      take: 200,
    });

    return NextResponse.json(serialize(logs));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
