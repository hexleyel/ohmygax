import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireAuth(req, "admin");
    const { id } = await params;
    const user_id = Number(id);
    if (!Number.isInteger(user_id) || user_id <= 0) {
      return NextResponse.json({ error: "A valid user ID is required." }, { status: 400 });
    }
    if (user_id === session.user_id) {
      return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { user_id },
        include: {
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
      });
      if (!user) return { kind: "missing" as const };

      const hasHistory = Object.values(user._count).some((count) => count > 0);
      if (hasHistory) return { kind: "has-history" as const };

      await tx.user.delete({ where: { user_id } });
      return { kind: "deleted" as const, username: user.username, full_name: user.full_name };
    });

    if (result.kind === "missing") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (result.kind === "has-history") {
      return NextResponse.json(
        { error: "This account has associated records. Deactivate it instead to preserve its history." },
        { status: 409 },
      );
    }

    await writeAuditLog(db, {
      user: session,
      action: "USER_DELETE",
      module: "Settings",
      details: `Permanently removed unused account ${result.full_name} (${result.username})`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to remove user account:", error);
    return NextResponse.json({ error: "Failed to remove user account." }, { status: 500 });
  }
}
