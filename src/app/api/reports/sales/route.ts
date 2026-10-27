import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req, "admin");
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const requestedOffset = Number(searchParams.get("tzOffset"));
    const tzOffset = Number.isFinite(requestedOffset) && Math.abs(requestedOffset) <= 840
      ? requestedOffset
      : 0;

    const where: Record<string, unknown> = { voided: false };
    if (from || to) {
      const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
      const toDate = to ? new Date(`${to}T00:00:00.000Z`) : null;
      if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
        return NextResponse.json({ error: "Invalid report date range." }, { status: 400 });
      }
      // Date picker values describe local calendar dates. Shift their UTC
      // midnight values by the browser offset to include the full local day.
      if (fromDate) fromDate.setUTCMinutes(fromDate.getUTCMinutes() - tzOffset);
      if (toDate) {
        toDate.setUTCDate(toDate.getUTCDate() + 1);
        toDate.setUTCMinutes(toDate.getUTCMinutes() - tzOffset);
      }
      where.transaction_date = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lt: toDate } : {}),
      };
    }

    const transactions = await db.transaction.findMany({
      where,
      include: { details: { include: { product: true } }, user: true },
      orderBy: { transaction_date: "desc" },
    });

    const totalSales = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
    const totalVat = transactions.reduce((sum, t) => sum + Number(t.vat_amount), 0);
    const totalDiscount = transactions.reduce((sum, t) => sum + Number(t.discount_amount), 0);

    const productPerformance: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const t of transactions) {
      for (const d of t.details) {
        const key = d.product.sku;
        productPerformance[key] = productPerformance[key] || {
          name: d.product.name,
          qty: 0,
          revenue: 0,
        };
        productPerformance[key].qty += d.quantity;
        productPerformance[key].revenue += Number(d.subtotal);
      }
    }

    return NextResponse.json(
      serialize({
        transactionCount: transactions.length,
        totalSales,
        totalVat,
        totalDiscount,
        productPerformance: Object.entries(productPerformance).map(([sku, v]) => ({
          sku,
          ...v,
        })),
        transactions,
      }),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
