import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { buildProductCode } from "@/lib/reference";
import { serialize } from "@/lib/serialize";
import { stockTierQuantities } from "@/lib/stockTiers";
import { cylinderCategoryCodes } from "@/lib/categories";
import { DuplicateBinLocationError } from "@/lib/errors";
import { BIN_LOCATION_HINT, isBinLocation, normalizeBinLocation } from "@/lib/binLocations";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const { searchParams } = new URL(req.url);
    const showArchived = searchParams.get("status") === "archived";
    // Return the complete matching catalogue; the Products page paginates
    // locally so new or restored rows never push older products out of view.
    const search = (searchParams.get("search") ?? "").trim();
    const matchingCategories = search
      ? await db.category.findMany({
          where: {
            OR: [
              { name: { contains: search } },
              { code: { contains: search } },
            ],
          },
          select: { code: true },
        })
      : [];

    const products = await db.product.findMany({
      where: {
        status: showArchived ? "archived" : "active",
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { category: { contains: search } },
                ...(matchingCategories.length
                  ? [{ category: { in: matchingCategories.map((category) => category.code) } }]
                  : []),
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });

    // Most recent purchase cost per product, so a new PO line can pre-fill the
    // price that was last actually paid instead of starting at zero.
    //
    // Ordered by the order's own date rather than the row id, because the id
    // only reflects insertion order. A cancelled order was never bought at
    // that price, so it is excluded rather than quoted back as the latest.
    const [poItems, cylinderCodes] = await Promise.all([db.purchaseOrderItem.findMany({
      where: { purchaseOrder: { status: { not: "cancelled" } } },
      orderBy: [{ purchaseOrder: { order_date: "desc" } }, { id: "desc" }],
      select: { product_id: true, unit_cost: true },
    }), cylinderCategoryCodes()]);
    const lastCost = new Map<number, unknown>();
    for (const item of poItems) {
      if (!lastCost.has(item.product_id)) lastCost.set(item.product_id, item.unit_cost);
    }

    return NextResponse.json(
      serialize(
        products.map((p) => {
          const tiers = stockTierQuantities(p);
          return {
            ...p,
            is_cylinder: cylinderCodes.has(p.category),
            new_stock_qty: tiers.newStock,
            old_stock_qty: tiers.oldStock,
            last_unit_cost: lastCost.get(p.product_id) ?? null,
          };
        }),
      ),
    );
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

    const base_price = Number(body.base_price) || 0;
    const margin_pct = Number(body.margin_pct) || 0;
    // New products remain unsellable until an admin explicitly saves pricing
    // in Price Management. A zero selling price is the persisted Pending marker.
    const selling_price = 0;
    const initialStock = Number(body.stock_qty) || 0;
    const location = normalizeBinLocation(body.location);

    if (!String(body.name ?? "").trim()) {
      return NextResponse.json({ error: "Product name is required." }, { status: 400 });
    }
    if (!String(body.category ?? "").trim()) {
      return NextResponse.json({ error: "Category is required." }, { status: 400 });
    }
    if (location && location.length > 80) {
      return NextResponse.json({ error: "Bin location must be 80 characters or fewer." }, { status: 400 });
    }
    if (location && !isBinLocation(location)) {
      return NextResponse.json({ error: BIN_LOCATION_HINT }, { status: 400 });
    }

    // Both statements run in one transaction: the row is created to obtain its
    // id, then the code is derived from that id. Without the transaction a
    // failure in between would leave a product wearing its TMP- placeholder.
    const coded = await db.$transaction(async (tx) => {
      if (location) {
        const occupied = await tx.product.findFirst({
          where: { location, status: "active" },
          select: { name: true },
        });
        if (occupied) throw new DuplicateBinLocationError(location, occupied.name);
      }
      const created = await tx.product.create({
        data: {
          sku: `TMP-${Date.now()}`,
        name: body.name,
          category: body.category,
          uom: body.uom,
          base_price,
          margin_pct,
          selling_price,
          stock_qty: initialStock,
          new_stock_qty: initialStock,
          old_stock_qty: 0,
          full_qty: Number(body.full_qty) || 0,
          empty_qty: Number(body.empty_qty) || 0,
          min_stock: Number(body.min_stock) || 0,
          max_stock: Number(body.max_stock) || 0,
          location,
          status: "active",
        },
      });

      let assignedLocation = location;
      if (!assignedLocation) {
        assignedLocation = `BIN-PRODUCT-${created.product_id}-01`;
        let suffix = 1;
        while (await tx.product.findFirst({
          where: { location: assignedLocation, status: "active" },
          select: { product_id: true },
        })) {
          suffix += 1;
          assignedLocation = `BIN-PRODUCT-${created.product_id}-${String(suffix).padStart(2, "0")}`;
        }
      }

      return tx.product.update({
        where: { product_id: created.product_id },
        data: { sku: buildProductCode(body.category, created.product_id), location: assignedLocation },
      });
    }, { isolationLevel: "Serializable" });

    await writeAuditLog(db, {
      user: session,
      action: "PRODUCT_CREATE",
      module: "Product Management",
      details: `Created product ${coded.sku} — ${coded.name}`,
    });

    return NextResponse.json(serialize(coded), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DuplicateBinLocationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
