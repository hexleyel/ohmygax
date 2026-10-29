import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { calculateSellingPrice, validateMarginPricing } from "@/lib/calc";
import { DuplicateBinLocationError } from "@/lib/errors";
import { BIN_LOCATION_HINT, isBinLocation, normalizeBinLocation } from "@/lib/binLocations";
import { serialize } from "@/lib/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    requireAuth(req);
    const product = await db.product.findUnique({
      where: { product_id: Number(id) },
    });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serialize(product));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json();
    const product_id = Number(id);

    const existing = await db.product.findUnique({ where: { product_id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const location = body.location === undefined ? existing.location : normalizeBinLocation(body.location);
    const status = body.status ?? existing.status;
    if (location && location.length > 80) {
      return NextResponse.json({ error: "Bin location must be 80 characters or fewer." }, { status: 400 });
    }
    if (body.location !== undefined && location && !isBinLocation(location)) {
      return NextResponse.json({ error: BIN_LOCATION_HINT }, { status: 400 });
    }
    if (status === "active" && !location) {
      return NextResponse.json({ error: "Active products must have a bin location." }, { status: 400 });
    }

    const base_price =
      body.base_price !== undefined ? Number(body.base_price) : Number(existing.base_price);
    const margin_pct =
      body.margin_pct !== undefined ? Number(body.margin_pct) : Number(existing.margin_pct);
    // Explicit pricing fields represent the admin's save action. This also
    // lets a Pending product with a stored 0% margin be activated at 0%.
    const changingPricing = body.margin_pct !== undefined || body.base_price !== undefined;

    if (Number(existing.selling_price) <= 0 && changingPricing && body.margin_pct === undefined) {
      return NextResponse.json({ error: "Enter a margin percentage before activating pending pricing." }, { status: 400 });
    }

    if (changingPricing) {
      const pricingProblem = validateMarginPricing(base_price, margin_pct);
      if (pricingProblem) {
        return NextResponse.json({ error: pricingProblem }, { status: 400 });
      }
      if (calculateSellingPrice(base_price, margin_pct) <= 0) {
        return NextResponse.json({ error: "Selling price must be above 0." }, { status: 400 });
      }
    }

    const selling_price = changingPricing
      ? calculateSellingPrice(base_price, margin_pct)
      : Number(existing.selling_price);

    const updated = await db.$transaction(async (tx) => {
      if (status === "active" && location) {
        const occupied = await tx.product.findFirst({
          where: { location, status: "active", product_id: { not: product_id } },
          select: { name: true },
        });
        if (occupied) throw new DuplicateBinLocationError(location, occupied.name);
      }

      return tx.product.update({
        where: { product_id },
        data: {
          name: body.name ?? existing.name,
          category: body.category ?? existing.category,
          uom: body.uom ?? existing.uom,
          base_price,
          margin_pct,
          selling_price,
          min_stock: body.min_stock !== undefined ? Number(body.min_stock) : existing.min_stock,
          max_stock: body.max_stock !== undefined ? Number(body.max_stock) : existing.max_stock,
          location,
          status,
        },
      });
    }, { isolationLevel: "Serializable" });

    // Price moves are logged distinctly from ordinary edits, with the before
    // and after figures, since pricing is what the audit trail is mostly for.
    const marginChanged = Number(existing.margin_pct) !== margin_pct;
    const sellingChanged =
      Number(existing.selling_price) !== Number(updated.selling_price);
    const restored = existing.status === "archived" && updated.status === "active";

    let action = "PRODUCT_UPDATE";
    let details = `Updated product ${updated.sku} — ${updated.name}`;

    if (marginChanged || sellingChanged) {
      action = "PRODUCT_PRICE_CHANGE";
      details =
        `${updated.sku} — ${updated.name}: margin ${Number(existing.margin_pct)}% → ${margin_pct}%, ` +
        `selling ₱${Number(existing.selling_price).toFixed(2)} → ₱${Number(updated.selling_price).toFixed(2)}`;
    } else if (restored) {
      action = "PRODUCT_RESTORE";
      details = `Restored product ${updated.sku} — ${updated.name}`;
    } else if (existing.status !== updated.status) {
      action = "PRODUCT_STATUS_CHANGE";
      details = `${updated.sku} — ${updated.name}: ${existing.status} → ${updated.status}`;
    }

    await writeAuditLog(db, {
      user: session,
      action,
      module: "Product Management",
      details,
    });

    return NextResponse.json(serialize(updated));
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

/** Archive (soft delete) — status flips to "archived", row is never destroyed. */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const session = requireAuth(req, "admin");
    const product_id = Number(id);

    const updated = await db.product.update({
      where: { product_id },
      data: { status: "archived" },
    });

    await writeAuditLog(db, {
      user: session,
      action: "PRODUCT_ARCHIVE",
      module: "Product Management",
      details: `Archived product ${updated.sku} — ${updated.name}`,
    });

    return NextResponse.json({ success: true, product: serialize(updated) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
