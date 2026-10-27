import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { buildInterimSalesSummary } from "@/lib/reports";
import { serialize } from "@/lib/serialize";

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req);
    const summary = await buildInterimSalesSummary();

    // Mirror of the UI rule: the drawer must be counted and the shift closed
    // before an end-of-day report can be locked in.
    if (!summary.canGenerateZ) {
      return NextResponse.json(
        {
          error:
            "Close the shift and enter the actual cash counted in Cash Management before generating a Z report.",
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Persist the Z-Report as a permanent record so it can be reviewed later.
    await db.zReport.create({
      data: {
        user_id: session.user_id,
        generated_at: now,
        since: new Date(summary.since),
        transaction_count: summary.transactionCount,
        total_sales: summary.totalSales,
        total_vat: summary.totalVat,
        cash_sales: summary.cashSales,
        gcash_sales: summary.gcashSales,
      },
    });

    await db.settings.upsert({
      where: { key: "last_z_report_at" },
      update: { value: nowIso },
      create: { key: "last_z_report_at", value: nowIso },
    });

    await writeAuditLog(db, {
      user: session,
      action: "Z_REPORT",
      module: "X & Z Reports",
      details: `Generated Z report — ${summary.transactionCount} transactions, ₱${summary.totalSales.toFixed(2)} total`,
    });

    return NextResponse.json(serialize({ ...summary, generatedAt: nowIso }));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
