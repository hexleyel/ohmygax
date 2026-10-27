import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireAuth(req, "admin");
    const { id } = await params;
    const user_id = Number(id);
    const body = await req.json();
    const status = body.status;

    if (!Number.isInteger(user_id) || user_id <= 0 || !["active", "inactive"].includes(status)) {
      return NextResponse.json({ error: "A valid user and account status are required." }, { status: 400 });
    }
    if (user_id === session.user_id && status === "inactive") {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }

    const administrator = await db.user.findUnique({ where: { user_id: session.user_id } });
    const passwordMatches = administrator
      ? await bcrypt.compare(String(body.current_password || ""), administrator.password)
      : false;
    if (!administrator || administrator.status !== "active" || !passwordMatches) {
      return NextResponse.json({ error: "Incorrect password. Please try again." }, { status: 401 });
    }

    const existing = await db.user.findUnique({ where: { user_id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const updated = await db.user.update({
      where: { user_id },
      data: { status },
      select: { user_id: true, username: true, full_name: true, role: true, status: true },
    });

    await writeAuditLog(db, {
      user: session,
      action: status === "active" ? "USER_REACTIVATE" : "USER_DEACTIVATE",
      module: "Settings",
      details: `${status === "active" ? "Reactivated" : "Deactivated"} account for ${existing.full_name} (${existing.username})`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update user account status:", error);
    return NextResponse.json({ error: "Failed to update account status." }, { status: 500 });
  }
}
