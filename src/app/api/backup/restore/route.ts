import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

/**
 * Restores a snapshot produced by GET /api/backup.
 *
 * This REPLACES everything currently in the database. It runs inside a single
 * transaction, so a failure part-way leaves the existing data untouched
 * rather than half-overwritten.
 */
export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const data = body?.data;

    if (!data || typeof data !== "object" || !Array.isArray(data.users)) {
      return NextResponse.json(
        { error: "That doesn't look like an OHMYGAS backup file." },
        { status: 400 },
      );
    }
    if (data.users.length === 0) {
      return NextResponse.json(
        { error: "Backup contains no user accounts — restoring it would lock you out." },
        { status: 400 },
      );
    }

    const rows = (v: unknown) => (Array.isArray(v) ? v : []);

    await db.$transaction(async (tx) => {
      // Clear children before parents so foreign keys stay satisfied.
      await tx.transactionDetail.deleteMany();
      await tx.transaction.deleteMany();
      await tx.deliveryItem.deleteMany();
      await tx.delivery.deleteMany();
      await tx.purchaseOrderItem.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.productSupplier.deleteMany();
      await tx.inventoryLog.deleteMany();
      await tx.zReport.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.cashSession.deleteMany();
      await tx.product.deleteMany();
      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();
      await tx.settings.deleteMany();
      await tx.user.deleteMany();

      // Insert parents before children, in dependency order.
      await tx.user.createMany({ data: rows(data.users) });
      await tx.supplier.createMany({ data: rows(data.suppliers) });
      await tx.product.createMany({ data: rows(data.products) });
      await tx.productSupplier.createMany({ data: rows(data.productSuppliers) });
      await tx.customer.createMany({ data: rows(data.customers) });
      await tx.settings.createMany({ data: rows(data.settings) });
      await tx.cashSession.createMany({ data: rows(data.cashSessions) });
      await tx.purchaseOrder.createMany({ data: rows(data.purchaseOrders) });
      await tx.purchaseOrderItem.createMany({ data: rows(data.purchaseOrderItems) });
      await tx.delivery.createMany({ data: rows(data.deliveries) });
      await tx.deliveryItem.createMany({ data: rows(data.deliveryItems) });
      await tx.transaction.createMany({ data: rows(data.transactions) });
      await tx.transactionDetail.createMany({ data: rows(data.transactionDetails) });
      await tx.inventoryLog.createMany({ data: rows(data.inventoryLogs) });
      await tx.zReport.createMany({ data: rows(data.zReports) });
      await tx.auditLog.createMany({ data: rows(data.auditLogs) });
    });

    await writeAuditLog(db, {
      user: session,
      action: "BACKUP_RESTORE",
      module: "Settings",
      details: `Restored a backup taken ${body?.meta?.generated_at ?? "at an unknown time"}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          "Restore failed and nothing was changed. The file may be from a different version of the system.",
      },
      { status: 500 },
    );
  }
}
