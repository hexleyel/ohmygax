import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth";
import db from "@/lib/db";

type TxClient = typeof db | Prisma.TransactionClient;

export async function writeAuditLog(
  client: TxClient,
  params: {
    user: SessionUser;
    action: string;
    module: string;
    details: string;
  },
) {
  await client.auditLog.create({
    data: {
      user_id: params.user.user_id,
      role: params.user.role,
      action: params.action,
      module: params.module,
      details: params.details,
    },
  });
}
