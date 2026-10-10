"use client";

/** Thrown when the server cannot be reached at all (no internet / server off). */
export class NetworkError extends Error {
  constructor() {
    super("Cannot reach the server. Check the internet or that the shop computer is on.");
    this.name = "NetworkError";
  }
}

/** Error with the HTTP status the server answered with. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/** Small fetch wrapper: throws HttpError with the server's friendly message, or NetworkError. */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; noRedirect?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new NetworkError();
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && typeof window !== "undefined" && !options.noRedirect && !url.startsWith("/api/auth/login")) {
    window.location.href = "/login";
  }
  // A gateway error means the app server is down behind a proxy: treat it like no connection.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new NetworkError();
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? "Something went wrong.";
    throw new HttpError(res.status, msg);
  }
  return data as T;
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDate(d: string | Date | undefined | null, withTime = false) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(d));
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  bank: "Bank Transfer",
  credit: "Udhaar (Credit)",
};

export const UNIT_LABELS: Record<string, string> = {
  pcs: "Piece",
  kg: "Kg",
  g: "Gram",
  litre: "Litre",
  ml: "ml",
  dozen: "Dozen",
  pack: "Pack",
  box: "Box",
  carton: "Carton",
};

/** Units that are usually sold in fractions (e.g. 0.5 kg). */
export const LOOSE_UNITS = new Set(["kg", "g", "litre", "ml"]);
