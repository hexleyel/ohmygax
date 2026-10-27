import type { Prisma } from "@/generated/prisma/client";
import db from "@/lib/db";

type TxClient = typeof db | Prisma.TransactionClient;

/**
 * Recomputes a customer's tier after a completed delivery.
 * `bulk` is manual-only and is never auto-downgraded by this job.
 */
export async function reclassifyCustomer(tx: TxClient, customer_id: number) {
  const customer = await tx.customer.findUniqueOrThrow({ where: { customer_id } });
  if (customer.type === "bulk" || customer.type === "vip") return customer;

  const completed = await tx.delivery.findMany({
    where: { customer_id, status: "completed" },
  });
  const completedCount = completed.length;

  // Tiers are based on completed deliveries. "vip" and "bulk" are assigned by
  // hand, so this never overwrites them.
  let type = "new";
  if (completedCount >= 10) type = "loyal";
  else if (completedCount >= 1) type = "regular";

  if (type === customer.type) return customer;
  return tx.customer.update({ where: { customer_id }, data: { type } });
}
