import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  clearPendingCookie,
  createSessionCookie,
  getPendingFromRequest,
  signJwt,
} from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const pending = getPendingFromRequest(req);
  if (!pending) {
    return NextResponse.json({ error: "Login session expired" }, { status: 401 });
  }

  const body = await req.json();
  const user = await db.user.findUnique({ where: { user_id: pending.user_id } });

  if (user && user.status !== "active") {
    const response = NextResponse.json(
      { error: "Account is inactive. Please contact an administrator." },
      { status: 403 },
    );
    response.headers.append("Set-Cookie", clearPendingCookie());
    return response;
  }

  if (!user || !user.two_factor_secret || !verifyTotp(user.two_factor_secret, body.code || "")) {
    return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
  }

  const sessionUser = {
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    must_change_password: user.must_change_password,
  };

  const token = signJwt(sessionUser);

  await writeAuditLog(db, {
    user: sessionUser,
    action: "LOGIN",
    module: "Authentication",
    details: `${user.username} logged in (2FA verified)`,
  });

  const response = NextResponse.json({
    success: true,
    role: user.role,
    full_name: user.full_name,
    must_change_password: user.must_change_password,
  });
  response.headers.append("Set-Cookie", createSessionCookie(token));
  response.headers.append("Set-Cookie", clearPendingCookie());
  return response;
}
