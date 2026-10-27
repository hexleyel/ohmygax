import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { buildInterimSalesSummary } from "@/lib/reports";
import { serialize } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    requireAuth(req);
    const summary = await buildInterimSalesSummary();
    return NextResponse.json(serialize(summary));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
