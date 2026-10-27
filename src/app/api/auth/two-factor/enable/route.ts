import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const { secret, code } = body as { secret: string; code: string };

    if (!secret || !verifyTotp(secret, code || "")) {
      return NextResponse.json({ error: "Invalid authentication code" }, { status: 400 });
    }

    await db.user.update({
      where: { user_id: session.user_id },
      data: { two_factor_secret: secret, two_factor_enabled: true },
    });

    await writeAuditLog(db, {
      user: session,
      action: "SETTINGS_UPDATE",
      module: "Two-Factor Authentication",
      details: `${session.username} enabled two-factor authentication`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
