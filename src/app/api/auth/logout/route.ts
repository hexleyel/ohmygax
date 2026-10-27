import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { clearSessionCookie, getSessionFromRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Read the session before clearing it so the logout can be attributed.
  const session = getSessionFromRequest(req);
  if (session) {
    await writeAuditLog(db, {
      user: session,
      action: "LOGOUT",
      module: "Authentication",
      details: `${session.username} logged out`,
    });
  }

  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}
