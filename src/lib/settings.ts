import db from "@/lib/db";

export async function loadSettings() {
  const rows = await db.settings.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    vatRate: Number(map.vat_rate ?? 12),
    cylinderFee: Number(map.cylinder_exchange_fee ?? 150),
    bulkDiscountThreshold: Number(map.bulk_discount_threshold ?? 5),
    bulkDiscountRate: Number(map.bulk_discount_rate ?? 5),
    seniorDiscountRate: Number(map.senior_discount_rate ?? 20),
    lastZReportAt: map.last_z_report_at ?? null,
  };
}
