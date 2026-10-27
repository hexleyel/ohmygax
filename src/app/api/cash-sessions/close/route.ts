import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();

    const openSession = await db.cashSession.findFirst({
      where: { user_id: session.user_id, status: "open" },
    });
    if (!openSession) {
      return NextResponse.json({ error: "No open shift found" }, { status: 400 });
    }

    const closed = await db.cashSession.update({
      where: { session_id: openSession.session_id },
      data: {
        status: "closed",
        closed_at: new Date(),
        actual_cash_counted: Number(body.actual_cash_counted) || 0,
      },
    });

    // The Z report (not this route) closes the reporting window — otherwise
    // the Z generated after this close would report zero transactions.

    await writeAuditLog(db, {
      user: session,
      action: "CASH_SESSION_CLOSE",
      module: "Cash Management",
      details: `Closed shift #${closed.session_id} with counted cash ₱${closed.actual_cash_counted}`,
    });

    return NextResponse.json(serialize(closed));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
