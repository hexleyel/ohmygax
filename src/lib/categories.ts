import type { Prisma } from "@/generated/prisma/client";
import db from "@/lib/db";

type TxClient = typeof db | Prisma.TransactionClient;

/**
 * Category codes flagged as cylinders. The cylinder exchange fee and the
 * full/empty counters key off this rather than a hardcoded "cylinder" string,
 * so a category added in File Maintenance can behave like one too.
 */
export async function cylinderCategoryCodes(tx: TxClient = db) {
  const rows = await tx.category.findMany({
    where: { is_cylinder: true },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}
