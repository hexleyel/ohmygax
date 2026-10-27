import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/lib/db";
import { AuthError, createSessionCookie, requireAuth, signJwt } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();
    const { current_password, new_password } = body as {
      current_password: string;
      new_password: string;
    };

    if (!new_password || new_password.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const user = await db.user.findUniqueOrThrow({
      where: { user_id: session.user_id },
    });

    const matches = await bcrypt.compare(current_password || "", user.password);
    if (!matches) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.user.update({
      where: { user_id: session.user_id },
      data: { password: hashed, must_change_password: false },
    });

    await writeAuditLog(db, {
      user: session,
      action: "PASSWORD_CHANGE",
      module: "Settings",
      details: `${session.username} changed their password`,
    });

    // Re-issue the session so the must_change_password flag is cleared. Only
    // the identity fields are carried over — never the old token's claims.
    const token = signJwt({
      user_id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      role: session.role,
      must_change_password: false,
    });
    const response = NextResponse.json({ success: true });
    response.headers.set("Set-Cookie", createSessionCookie(token));
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
