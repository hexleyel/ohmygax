import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AuthError, requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { DEFAULT_SETTINGS } from "@/lib/defaultSettings";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const rows = await db.settings.findMany();
    const settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load settings:", error);
    return NextResponse.json({ ...DEFAULT_SETTINGS });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const body = await req.json() as Record<string, string>;

    await db.$transaction(
      Object.entries(body).map(([key, value]) =>
        db.settings.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        }),
      ),
    );

    await writeAuditLog(db, {
      user: session,
      action: "SETTINGS_UPDATE",
      module: "Settings",
      details: `Updated settings: ${Object.keys(body).join(", ")}`,
    });

    const rows = await db.settings.findMany();
    return NextResponse.json({ ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
