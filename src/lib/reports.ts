import db from "@/lib/db";
import { loadSettings } from "@/lib/settings";

export async function buildInterimSalesSummary() {
  const settings = await loadSettings();
  const since = settings.lastZReportAt ? new Date(settings.lastZReportAt) : new Date(0);
  if (!settings.lastZReportAt) {
    since.setHours(0, 0, 0, 0);
  }

  // POS sales are normally tied to a session, but completed deliveries may
  // happen without an open drawer. Include all sales in the reporting window
  // by transaction timestamp so those deliveries remain in X/Z totals.
  const latestSession = await db.cashSession.findFirst({
    orderBy: { opened_at: "desc" },
  });
  const transactions = await db.transaction.findMany({
    where: { voided: false, transaction_date: { gte: since } },
  });

  const totalSales = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
  const totalVat = transactions.reduce((sum, t) => sum + Number(t.vat_amount), 0);
  const deliverySales = transactions
    .filter((t) => t.source_delivery_id !== null)
    .reduce((sum, t) => sum + Number(t.total_amount), 0);
  const posSales = totalSales - deliverySales;
  const cashSales = transactions
    .filter((t) => t.payment_method === "cash")
    .reduce((sum, t) => sum + Number(t.total_amount), 0);
  const gcashSales = transactions
    .filter((t) => t.payment_method === "gcash")
    .reduce((sum, t) => sum + Number(t.total_amount), 0);

  // The shift covering this reporting window supplies the opening float, so
  // the X report can show expected cash on hand rather than sales alone.
  const beginningBalance = latestSession ? Number(latestSession.beginning_balance) : 0;
  const actualCashCounted =
    latestSession?.actual_cash_counted !== null && latestSession?.actual_cash_counted !== undefined
      ? Number(latestSession.actual_cash_counted)
      : null;

  // A Z report may only be generated once the shift has been closed and the
  // drawer counted, and only if that shift hasn't been reported on already.
  const shiftClosed = latestSession?.status === "closed";
  const countedCash = actualCashCounted !== null;
  const closedAfterLastZ =
    !!latestSession?.closed_at &&
    (!settings.lastZReportAt ||
      new Date(latestSession.closed_at) > new Date(settings.lastZReportAt));

  return {
    terminal: "#01",
    since: since.toISOString(),
    transactionCount: transactions.length,
    totalSales,
    grossSales: totalSales,
    netSales: Number((totalSales - totalVat).toFixed(2)),
    posSales,
    deliverySales,
    totalVat,
    cashSales,
    gcashSales,
    beginningBalance,
    // Opening float plus cash taken in — what should physically be in the drawer.
    expectedCashOnHand: beginningBalance + cashSales,
    actualCashCounted,
    shiftStatus: latestSession?.status ?? null,
    canGenerateZ: shiftClosed && countedCash && closedAfterLastZ,
  };
}
