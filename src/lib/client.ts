"use client";

/** Small fetch wrapper: throws an Error with the server's friendly message. */
export async function api<T = unknown>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/login")) {
    window.location.href = "/login";
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? "Something went wrong.";
    throw new Error(msg);
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
