"use client";

import { formatPKR } from "./money";

export type WaMode = "app" | "web" | "auto";
const MODE_KEY = "dukaan:wa-mode";

export const DEFAULT_WA_TEMPLATE =
  "Assalam o Alaikum {name},\n{shop} ki taraf se yaad-dehani: aap ke khate mein {amount} baqaya hai.\nMeharbani farma kar jald ada kar dein. Shukriya!\n{shop} {shopPhone}";

export const DEFAULT_WA_PAYMENT_TEMPLATE =
  "Assalam o Alaikum {name},\nAap ki adaigi {amount} ({method}) wusool ho gayi. Shukriya!\nRaseed: {receiptNo} — {date}\nBaqaya: {balance}\n{shop} {shopPhone}";

/** Which WhatsApp this computer opens: the Desktop app, WhatsApp Web, or let the browser ask. */
export function getWaMode(): WaMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "app" || v === "web" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setWaMode(mode: WaMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Pakistani number → 923001234567 (what WhatsApp expects). Null if it is not a mobile number. */
export function waNumber(phone?: string | null) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(2);
  if (d.startsWith("03")) d = "92" + d.slice(1);
  if (d.startsWith("3") && d.length === 10) d = "92" + d;
  // Allow other countries' numbers given in international format (e.g. relatives abroad).
  if (/^923\d{9}$/.test(d) || (/^\d{10,15}$/.test(d) && !d.startsWith("0") && !d.startsWith("92"))) return d;
  return null;
}

export function waLink(phone: string, text: string, mode: WaMode = getWaMode()) {
  const t = encodeURIComponent(text);
  if (mode === "app") return `whatsapp://send?phone=${phone}&text=${t}`;
  if (mode === "web") return `https://web.whatsapp.com/send?phone=${phone}&text=${t}`;
  return `https://wa.me/${phone}?text=${t}`;
}

/** Opens WhatsApp with the message typed in; the shopkeeper only presses Send. */
export function openWhatsApp(phone: string, text: string) {
  const mode = getWaMode();
  const link = waLink(phone, text, mode);
  if (mode === "app") {
    window.location.href = link;
  } else {
    window.open(link, "whatsapp");
  }
}

export function reminderMessage(template: string | undefined, v: { name: string; amount: number; shop: string; shopPhone?: string }) {
  return (template || DEFAULT_WA_TEMPLATE)
    .replace(/\{name\}/g, v.name)
    .replace(/\{amount\}/g, formatPKR(v.amount))
    .replace(/\{shop\}/g, v.shop)
    .replace(/\{shopPhone\}/g, v.shopPhone ?? "")
    .trim();
}

/** Confirmation after a customer pays: amount received, receipt number and what is still due. */
export function paymentMessage(
  template: string | undefined,
  v: { name: string; amount: number; balance: number; receiptNo?: string; date: string; method?: string; shop: string; shopPhone?: string },
) {
  const due = v.balance > 0 ? formatPKR(v.balance) : v.balance < 0 ? `${formatPKR(-v.balance)} advance (jama)` : "Rs 0 — khata clear ✓";
  const date = new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v.date));
  return (template || DEFAULT_WA_PAYMENT_TEMPLATE)
    .replace(/\{name\}/g, v.name)
    .replace(/\{amount\}/g, formatPKR(v.amount))
    .replace(/\{balance\}/g, due)
    .replace(/\{receiptNo\}/g, v.receiptNo ?? "")
    .replace(/\{date\}/g, date)
    .replace(/\{method\}/g, METHOD[v.method ?? "cash"] ?? v.method ?? "")
    .replace(/\{shop\}/g, v.shop)
    .replace(/\{shopPhone\}/g, v.shopPhone ?? "")
    .trim();
}

const METHOD: Record<string, string> = { cash: "Cash", card: "Card", jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank transfer" };

type StatementRow = { date: string; kind: string; refNo?: string; amount: number; balance: number };

const KIND: Record<string, string> = {
  sale: "Bill",
  payment: "Payment received",
  return: "Return",
  opening: "Old balance",
  adjustment: "Udhaar added",
  purchase: "Purchase",
  reversal: "Payment cancelled",
};

/** Short text version of a khata statement for WhatsApp (latest entries). */
export function statementMessage(v: {
  shop: string;
  shopPhone?: string;
  name: string;
  from: string;
  to: string;
  opening: number;
  closing: number;
  rows: StatementRow[];
}) {
  const d = (s: string) => new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short" }).format(new Date(s));
  const last = v.rows.slice(-15);
  const lines = [
    `*${v.shop} — Khata Statement*`,
    `${v.name}`,
    `${d(v.from)} to ${d(v.to)}`,
    "",
    `Opening balance: ${formatPKR(v.opening)}`,
    ...(v.rows.length > last.length ? [`(${v.rows.length - last.length} earlier entries not shown)`] : []),
    ...last.map((r) => `${d(r.date)}  ${KIND[r.kind] ?? r.kind}${r.refNo ? ` ${r.refNo}` : ""}  ${r.amount > 0 ? "+" : "−"}${formatPKR(Math.abs(r.amount))}`),
    "",
    `*Balance due: ${formatPKR(v.closing)}*`,
    "",
    `Shukriya! ${v.shop}${v.shopPhone ? ` ${v.shopPhone}` : ""}`,
  ];
  return lines.join("\n");
}
