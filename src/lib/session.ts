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
  /** The user's session version when this login was made (see User.sessionVersion). */
  sv?: number;
};

/** Example values from the docs: anyone could sign a login with them, so they are refused. */
const KNOWN_SECRETS = ["change-me-to-a-long-random-string"];

/** The app's signing secret; refuses a missing, short or example value. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32 || KNOWN_SECRETS.includes(s) || /change-?me/i.test(s)) {
    throw new Error(
      "AUTH_SECRET must be a long random value of your own (at least 32 characters). Make one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return s;
}

function secret() {
  return new TextEncoder().encode(authSecret());
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
      sv: Number(payload.sv ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * "Secure" cookies only travel over HTTPS. Shops often open the app over plain http on their own
 * network (http://192.168.1.5:3000), so the flag follows the actual connection:
 * COOKIE_SECURE=always|never overrides it.
 */
export function isSecureRequest(req: Request) {
  const mode = process.env.COOKIE_SECURE;
  if (mode === "always") return true;
  if (mode === "never") return false;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (proto ?? new URL(req.url).protocol.replace(":", "")) === "https";
}

export function sessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}
