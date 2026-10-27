import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";
import { cylinderCategoryCodes } from "@/lib/categories";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [products, todaysTransactions, weeklyLogs, recentTransactions] = await Promise.all([
      db.product.findMany({ where: { status: "active" } }),
      db.transaction.findMany({
        where: { transaction_date: { gte: startOfDay }, voided: false },
      }),
      db.inventoryLog.findMany({
        where: { change_type: "empty_return", created_at: { gte: sevenDaysAgo } },
      }),
      db.transaction.findMany({
        orderBy: { transaction_date: "desc" },
        take: 5,
      }),
    ]);

    const cylinderCodes = await cylinderCategoryCodes();

    const totalProducts = products.length;
    const lowStock = products.filter((p) => p.stock_qty <= p.min_stock);
    const totalInventoryValue = products.reduce(
      (sum, p) => sum + Number(p.selling_price) * p.stock_qty,
      0,
    );

    const cylinderStockBySize = products
      .filter((p) => cylinderCodes.has(p.category))
      .map((p) => ({ name: p.name, full: p.full_qty, empty: p.empty_qty }));

    const todaysTotalSales = todaysTransactions.reduce(
      (sum, t) => sum + Number(t.total_amount),
      0,
    );

    const weeklyEmptyReturns: Record<string, number> = {};
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      weeklyEmptyReturns[dayLabels[d.getDay()]] = 0;
    }
    for (const log of weeklyLogs) {
      const label = dayLabels[new Date(log.created_at).getDay()];
      if (label in weeklyEmptyReturns) weeklyEmptyReturns[label] += log.quantity;
    }

    return NextResponse.json(
      serialize({
        totalProducts,
        lowStockAlerts: lowStock.map((p) => ({
          name: p.name,
          stock_qty: p.stock_qty,
          min_stock: p.min_stock,
        })),
        totalInventoryValue,
        cylinderStockBySize,
        weeklyEmptyReturns: Object.entries(weeklyEmptyReturns).map(([day, qty]) => ({
          day,
          qty,
        })),
        todaysTotalSales,
        recentTransactions,
      }),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load dashboard summary:", error);
    return NextResponse.json(
      { error: "Unable to load dashboard summary. Please try again." },
      { status: 500 },
    );
  }
}
