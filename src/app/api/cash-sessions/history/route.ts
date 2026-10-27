import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const userId = searchParams.get("user_id");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.opened_at = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) } : {}),
      };
    }
    if (userId) where.user_id = Number(userId);
    if (status) where.status = status;

    const sessions = await db.cashSession.findMany({
      where,
      include: {
        user: { select: { user_id: true, full_name: true, username: true } },
      },
      orderBy: { opened_at: "desc" },
    });

    // For each session, compute cash reconciliation by summing transactions
    // that belong to that session.
    const sessionIds = sessions.map((s) => s.session_id);
    const txSummaries = await db.transaction.groupBy({
      by: ["session_id", "payment_method"],
      where: {
        session_id: { in: sessionIds },
        voided: false,
      },
      _sum: { total_amount: true },
    });

    // Build a lookup: session_id -> { cash, gcash }
    const salesMap: Record<number, { cash: number; gcash: number }> = {};
    for (const row of txSummaries) {
      if (row.session_id === null) continue;
      if (!salesMap[row.session_id]) salesMap[row.session_id] = { cash: 0, gcash: 0 };
      const amount = Number(row._sum.total_amount ?? 0);
      if (row.payment_method === "cash") salesMap[row.session_id].cash += amount;
      if (row.payment_method === "gcash") salesMap[row.session_id].gcash += amount;
    }

    const enriched = sessions.map((s) => {
      const sales = salesMap[s.session_id] ?? { cash: 0, gcash: 0 };
      const beginningBalance = Number(s.beginning_balance);
      const cashSales = sales.cash;
      const gcashSales = sales.gcash;
      const totalSales = cashSales + gcashSales;
      const expectedCash = beginningBalance + cashSales;
      const actualCash = s.actual_cash_counted !== null ? Number(s.actual_cash_counted) : null;
      const variance = actualCash !== null ? actualCash - expectedCash : null;

      return {
        ...s,
        cash_sales: cashSales,
        gcash_sales: gcashSales,
        total_sales: totalSales,
        expected_cash: expectedCash,
        variance,
      };
    });

    return NextResponse.json(serialize(enriched));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
