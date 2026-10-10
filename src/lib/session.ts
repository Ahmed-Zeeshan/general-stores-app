import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "dukaan_session";
export type Role = "superadmin" | "owner" | "manager" | "cashier";
export type ShopRole = Exclude<Role, "superadmin">;
/** tenantId is null only for the platform super admin. */
export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  tenantId: string | null;
  /** Branch the user is locked to (read fresh from the database, not stored in the cookie). */
  branchId?: string | null;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters).");
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      name: String(payload.name),
      username: String(payload.username),
      role: payload.role as Role,
      tenantId: payload.tenantId ? String(payload.tenantId) : null,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12,
};
