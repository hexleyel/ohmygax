import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const statusFilter = req.nextUrl.searchParams.get("status") ?? "active";
    const where = statusFilter === "all"
      ? undefined
      : statusFilter === "inactive"
        ? { status: { in: ["inactive", "archived"] } }
        : { status: "active" };
    const suppliers = await db.supplier.findMany({
      where,
      include: { products: { include: { product: true } } },
      orderBy: { name: "asc" },
    });

    const shaped = suppliers.map((supplier) => ({
      ...supplier,
      products: undefined,
      suppliedProducts: supplier.products.map((ps) => ({
        product_id: ps.product.product_id,
        sku: ps.product.sku,
        name: ps.product.name,
      })),
    }));

    return NextResponse.json(serialize(shaped));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();

    const supplier = await db.supplier.create({
      data: {
        name: body.name,
        contact_person: body.contact_person,
        phone: body.phone,
        email: body.email || null,
        address: body.address,
        status: "active",
      },
    });

    const productIds: number[] = Array.isArray(body.product_ids)
      ? body.product_ids.map(Number)
      : [];

    if (productIds.length > 0) {
      await db.productSupplier.createMany({
        data: productIds.map((product_id) => ({
          product_id,
          supplier_id: supplier.supplier_id,
        })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog(db, {
      user: session,
      action: "SUPPLIER_CREATE",
      module: "Supplier Management",
      details: `Created supplier ${supplier.name}`,
    });

    return NextResponse.json(serialize(supplier), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
