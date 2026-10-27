import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/lib/db";
import { createPendingCookie, createSessionCookie, signJwt, signPendingTwoFactor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const user = await db.user.findUnique({
    where: { username: body.username },
  });

  if (!user || !(await bcrypt.compare(body.password || "", user.password))) {
    return NextResponse.json(
      { success: false, error: "Invalid credentials" },
      { status: 401 },
    );
  }

  if (user.status !== "active") {
    return NextResponse.json(
      { success: false, error: "Account is inactive. Please contact an administrator." },
      { status: 403 },
    );
  }

  if (user.two_factor_enabled) {
    const pendingToken = signPendingTwoFactor({ user_id: user.user_id });
    const response = NextResponse.json({
      success: false,
      two_factor_required: true,
    });
    response.headers.set("Set-Cookie", createPendingCookie(pendingToken));
    return response;
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
    details: `${user.username} logged in`,
  });

  const response = NextResponse.json({
    success: true,
    role: user.role,
    full_name: user.full_name,
    must_change_password: user.must_change_password,
    two_factor_enabled: user.two_factor_enabled,
  });
  response.headers.set("Set-Cookie", createSessionCookie(token));

  return response;
}
