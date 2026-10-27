import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const session = requireAuth(req);

    const openSession = await db.cashSession.findFirst({
      where: { user_id: session.user_id, status: "open" },
      orderBy: { opened_at: "desc" },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Fetch transactions scoped to the active session when one is open,
    // otherwise fall back to all of today's transactions for this cashier
    // (covers the edge-case where they view after closing their shift).
    const transactions = await db.transaction.findMany({
      where: openSession
        ? { session_id: openSession.session_id }
        : { user_id: session.user_id, transaction_date: { gte: startOfDay } },
      orderBy: { transaction_date: "desc" },
    });

    return NextResponse.json(serialize({ openSession, transactions }));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const body = await req.json();
    const rawBeginningBalance = body?.beginning_balance;
    const beginning_balance =
      rawBeginningBalance == null ||
      (typeof rawBeginningBalance === "string" && rawBeginningBalance.trim() === "")
        ? 0
        : Number(rawBeginningBalance);

    if (!Number.isFinite(beginning_balance) || beginning_balance < 0) {
      return NextResponse.json(
        { error: "Beginning balance must be a valid amount of 0 or more." },
        { status: 400 },
      );
    }

    const existing = await db.cashSession.findFirst({
      where: { user_id: session.user_id, status: "open" },
    });
    if (existing) {
      return NextResponse.json({ error: "A shift is already open" }, { status: 400 });
    }

    const created = await db.cashSession.create({
      data: {
        user_id: session.user_id,
        beginning_balance,
        status: "open",
      },
    });

    return NextResponse.json(serialize(created), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
