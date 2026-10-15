import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import mongoose, { Types } from "mongoose";
import { connectDB } from "./db";
import { SESSION_COOKIE, verifySession, type SessionUser, type ShopRole } from "./session";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The logged-in user, with role and active status re-checked against the database. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const fresh = await freshUser(session.id);
  // A password change (or reset) raises the version and ends every older login.
  if (!fresh.active || fresh.tenant !== session.tenantId || fresh.sv !== (session.sv ?? 0)) return null;
  return { ...session, role: fresh.role as SessionUser["role"], branchId: fresh.branch };
}

/** Reason a shop cannot be used right now, or null if it is fine. */
export function tenantBlockReason(t: { status?: string | null; expiresAt?: Date | null } | null): string | null {
  if (!t) return "This shop no longer exists.";
  if (t.status !== "active") return "This shop account is suspended. Please contact the administrator.";
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) {
    return "This shop's subscription has expired. Please contact the administrator.";
  }
  return null;
}

// Short caches so every request does not re-read the tenant/user. Suspensions and disabled
// accounts take effect within 15 seconds even though the login cookie is still valid.
const TTL = 15_000;
const tenantCache = new Map<string, { at: number; reason: string | null }>();
const userCache = new Map<string, { at: number; active: boolean; role: string; tenant: string | null; branch: string | null; sv: number }>();
export function forgetTenant(id: string) {
  tenantCache.delete(id);
}
export function forgetUser(id: string) {
  userCache.delete(id);
}

async function freshUser(id: string) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const u = await User.findById(id).select("active role tenant branch sessionVersion").lean();
  const entry = {
    at: Date.now(),
    active: !!u?.active,
    role: u?.role ?? "",
    tenant: u?.tenant ? String(u.tenant) : null,
    branch: u?.branch ? String(u.branch) : null,
    sv: u?.sessionVersion ?? 0,
  };
  userCache.set(id, entry);
  return entry;
}

async function checkTenant(id: string) {
  const hit = tenantCache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.reason;
  const t = await Tenant.findById(id).select("status expiresAt").lean();
  const reason = tenantBlockReason(t);
  tenantCache.set(id, { at: Date.now(), reason });
  return reason;
}

export type TenantContext = { user: SessionUser; tid: Types.ObjectId };

/** For shop routes: returns the user and their tenant id (as ObjectId, safe for find and aggregate). */
export async function requireTenant(roles?: ShopRole[]): Promise<TenantContext> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please log in again.");
  if (user.role === "superadmin" || !user.tenantId) {
    throw new ApiError(403, "This page is for shop users. Super admin manages shops from the Admin panel.");
  }
  if (roles && !roles.includes(user.role)) throw new ApiError(403, "You do not have permission to do this.");
  const reason = await checkTenant(user.tenantId);
  if (reason) throw new ApiError(403, reason);
  return { user, tid: new Types.ObjectId(user.tenantId) };
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please log in again.");
  if (user.role !== "superadmin") throw new ApiError(403, "Only the super admin can do this.");
  return user;
}

export async function requireAnyUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please log in again.");
  return user;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

const CHANGES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A change sent by a browser must come from a page of this app, not from another website the user has
 * open (cross-site request forgery). Browsers always send Origin on such requests; programs that send
 * none are judged by their login like any other request. TRUSTED_ORIGINS lists extra addresses
 * (comma separated) for setups where a proxy changes the host name.
 */
function fromThisSite(req: Request) {
  if (!CHANGES.has(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = [req.headers.get("x-forwarded-host")?.split(",")[0]?.trim(), req.headers.get("host")];
  const extra = (process.env.TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return own.includes(host) || extra.includes(origin);
}

/** API answers hold shop data: never kept by the browser or a proxy. */
function noStore(res: Response) {
  if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Wraps a route handler: connects to DB, converts thrown errors to friendly JSON. */
export function handle<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      if (!fromThisSite(req)) throw new ApiError(403, "This request did not come from the app. Please open the app's own page and try again.");
      await connectDB();
      const result = await fn(req, ctx);
      if (result instanceof Response) return noStore(result);
      return noStore(NextResponse.json(result ?? { ok: true }));
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status, headers: { "Cache-Control": "no-store" } });
      }
      // Body that is not valid JSON (or was cut off).
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: "The data sent was not valid. Please try again." }, { status: 400 });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const field = first?.path.join(".");
        return NextResponse.json(
          { error: field ? `${field}: ${first.message}` : first?.message ?? "Invalid data" },
          { status: 400 },
        );
      }
      if (err instanceof mongoose.Error.CastError) {
        return NextResponse.json({ error: "Record not found." }, { status: 404 });
      }
      if (err instanceof mongoose.Error.ValidationError) {
        const first = Object.values(err.errors)[0];
        return NextResponse.json({ error: first?.message ?? "Invalid data" }, { status: 400 });
      }
      if ((err as { code?: number }).code === 11000) {
        const key = Object.keys((err as { keyValue?: object }).keyValue ?? {}).find((k) => k !== "tenant") ?? "value";
        return NextResponse.json({ error: `This ${key} already exists.` }, { status: 409 });
      }
      console.error(err);
      // A setup problem only the person who installed the app can fix: say so plainly.
      if (err instanceof Error && err.message.startsWith("AUTH_SECRET")) {
        return NextResponse.json({ error: "The app is not set up correctly: AUTH_SECRET in .env.local is missing or too short (at least 32 characters). See README → Security checklist, then restart the app." }, { status: 500 });
      }
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD into an inclusive date range (server time zone). */
export function dateRange(url: URL, defaultDays = 0) {
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : startOfDay(addDays(new Date(), -defaultDays));
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : endOfDay(new Date());
  return { from, to };
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const TIMEZONE = process.env.TZ || "Asia/Karachi";

export const isObjectId = (s: string) => /^[a-f0-9]{24}$/i.test(s);
