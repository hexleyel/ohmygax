import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.generated_at = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) } : {}),
      };
    }

    const reports = await db.zReport.findMany({
      where,
      include: {
        user: { select: { user_id: true, full_name: true, username: true } },
      },
      orderBy: { generated_at: "desc" },
    });

    return NextResponse.json(serialize(reports));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
