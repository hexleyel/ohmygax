import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

function generateDefaultPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const user_id = Number(id);

    const defaultPassword = generateDefaultPassword();
    const hashed = await bcrypt.hash(defaultPassword, 10);

    const user = await db.user.update({
      where: { user_id },
      data: { password: hashed, must_change_password: true },
    });

    await writeAuditLog(db, {
      user: session,
      action: "USER_PASSWORD_RESET",
      module: "Settings",
      details: `Reset password for ${user.full_name} (${user.username})`,
    });

    return NextResponse.json({ default_password: defaultPassword });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
