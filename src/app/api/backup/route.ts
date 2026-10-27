import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

/**
 * Exports the whole database as a JSON snapshot the admin can download and
 * keep. Passwords are included because a restore has to be able to put the
 * accounts back — treat the file as sensitive.
 */
export async function GET(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");

    const [
      users,
      suppliers,
      products,
      productSuppliers,
      customers,
      purchaseOrders,
      purchaseOrderItems,
      deliveries,
      deliveryItems,
      cashSessions,
      transactions,
      transactionDetails,
      inventoryLogs,
      auditLogs,
      zReports,
      settings,
    ] = await Promise.all([
      db.user.findMany(),
      db.supplier.findMany(),
      db.product.findMany(),
      db.productSupplier.findMany(),
      db.customer.findMany(),
      db.purchaseOrder.findMany(),
      db.purchaseOrderItem.findMany(),
      db.delivery.findMany(),
      db.deliveryItem.findMany(),
      db.cashSession.findMany(),
      db.transaction.findMany(),
      db.transactionDetail.findMany(),
      db.inventoryLog.findMany(),
      db.auditLog.findMany(),
      db.zReport.findMany(),
      db.settings.findMany(),
    ]);

    const backup = {
      meta: {
        system: "OHMYGAS POS & Inventory",
        version: 1,
        generated_at: new Date().toISOString(),
        generated_by: session.username,
      },
      data: {
        users,
        suppliers,
        products,
        productSuppliers,
        customers,
        purchaseOrders,
        purchaseOrderItems,
        deliveries,
        deliveryItems,
        cashSessions,
        transactions,
        transactionDetails,
        inventoryLogs,
        auditLogs,
        zReports,
        settings,
      },
    };

    await writeAuditLog(db, {
      user: session,
      action: "BACKUP_CREATE",
      module: "Settings",
      details: `Exported a database backup (${transactions.length} transactions, ${products.length} products)`,
    });

    return NextResponse.json(serialize(backup));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
