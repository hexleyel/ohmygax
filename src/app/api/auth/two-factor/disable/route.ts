import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");

    await db.user.update({
      where: { user_id: session.user_id },
      data: { two_factor_secret: null, two_factor_enabled: false },
    });

    await writeAuditLog(db, {
      user: session,
      action: "SETTINGS_UPDATE",
      module: "Two-Factor Authentication",
      details: `${session.username} disabled two-factor authentication`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
