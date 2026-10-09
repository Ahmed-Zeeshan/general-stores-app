import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { connectDB } from "./db";
import { SESSION_COOKIE, verifySession, type Role, type SessionUser } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please log in again.");
  if (roles && !roles.includes(user.role)) {
    throw new ApiError(403, "You do not have permission to do this.");
  }
  return user;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wraps a route handler: connects to DB, converts thrown errors to friendly JSON. */
export function handle<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      await connectDB();
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
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
      if ((err as { code?: number }).code === 11000) {
        const key = Object.keys((err as { keyValue?: object }).keyValue ?? {})[0] ?? "value";
        return NextResponse.json({ error: `This ${key} already exists.` }, { status: 409 });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD into an inclusive date range (local server time). */
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
