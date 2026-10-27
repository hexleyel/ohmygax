import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export type SessionUser = {
  user_id: number;
  username: string;
  full_name: string;
  role: "admin" | "cashier";
  must_change_password?: boolean;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function signJwt(payload: SessionUser) {
  // verifyJwt returns the decoded token, which carries `iat`/`exp`. Re-signing
  // such an object while also passing `expiresIn` makes jsonwebtoken throw
  // ("the payload already has an exp property"), so strip the claims first.
  const { iat, exp, ...claims } = payload as SessionUser & {
    iat?: number;
    exp?: number;
  };
  void iat;
  void exp;
  return jwt.sign(claims, JWT_SECRET, { expiresIn: "8h" });
}

export function verifyJwt(token: string) {
  return jwt.verify(token, JWT_SECRET) as SessionUser;
}

export function createSessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production";
  return `ohmygas_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 8}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return "ohmygas_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

type PendingTwoFactor = { user_id: number };

export function signPendingTwoFactor(payload: PendingTwoFactor) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });
}

export function verifyPendingTwoFactor(token: string) {
  return jwt.verify(token, JWT_SECRET) as PendingTwoFactor;
}

export function createPendingCookie(token: string) {
  const secure = process.env.NODE_ENV === "production";
  return `ohmygas_pending=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=300${secure ? "; Secure" : ""}`;
}

export function clearPendingCookie() {
  return "ohmygas_pending=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

export function getPendingFromRequest(req: NextRequest) {
  const cookie = req.cookies.get("ohmygas_pending")?.value;
  if (!cookie) return null;
  try {
    return verifyPendingTwoFactor(cookie);
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest) {
  const cookie = req.cookies.get("ohmygas_session")?.value;
  if (!cookie) return null;

  try {
    return verifyJwt(cookie);
  } catch {
    return null;
  }
}

/** Throws AuthError(401) if not logged in, AuthError(403) if role doesn't match. */
export function requireAuth(req: NextRequest, role?: "admin" | "cashier") {
  const session = getSessionFromRequest(req);
  if (!session) throw new AuthError("Not authenticated", 401);
  if (role && session.role !== role) {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}
