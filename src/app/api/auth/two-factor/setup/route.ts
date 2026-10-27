import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { buildOtpAuthUrl, generateSecret } from "@/lib/totp";

export async function POST(req: NextRequest) {
  try {
    const session = requireAuth(req, "admin");
    const secret = generateSecret();
    const otpauthUrl = buildOtpAuthUrl(session.username, secret);
    return NextResponse.json({ secret, otpauthUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
