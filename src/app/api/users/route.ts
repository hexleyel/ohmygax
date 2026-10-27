import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

function generateDefaultPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const users = await db.user.findMany({
      select: {
        user_id: true,
        username: true,
        full_name: true,
        role: true,
        status: true,
        must_change_password: true,
        two_factor_enabled: true,
        created_at: true,
        _count: {
          select: {
            transactions: true,
            cashSessions: true,
            auditLogs: true,
            zReports: true,
            purchaseOrders: true,
          },
        },
      },
      orderBy: { full_name: "asc" },
    });
    const withHistoryFlag = users.map(({ _count, ...user }) => ({
      ...user,
      hasHistory: Object.values(_count).some((count) => count > 0),
    }));
    return NextResponse.json(serialize(withHistoryFlag));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();

    const defaultPassword = generateDefaultPassword();
    const hashed = await bcrypt.hash(defaultPassword, 10);

    const user = await db.user.create({
      data: {
        username: body.username,
        password: hashed,
        full_name: body.full_name,
        role: body.role === "admin" ? "admin" : "cashier",
        must_change_password: true,
      },
    });

    await writeAuditLog(db, {
      user: session,
      action: "USER_CREATE",
      module: "Settings",
      details: `Created ${user.role} account for ${user.full_name} (${user.username})`,
    });

    return NextResponse.json(
      serialize({
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        default_password: defaultPassword,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
