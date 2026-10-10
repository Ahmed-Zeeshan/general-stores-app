"use client";

/**
 * Offline support for billing. Everything is stored in this browser (localStorage):
 *  - the last product list, customer list and login details, so the POS opens without the server
 *  - an "outbox" of bills made while the server was unreachable, sent automatically later
 * Each bill carries a clientId, so sending it twice never creates two bills on the server.
 */
import { api, HttpError, NetworkError } from "./client";

export type OutboxBill = {
  clientId: string;
  soldAt: string;
  branchId?: string;
  branchName?: string;
  payload: Record<string, unknown>;
  total: number;
  change: number;
  customerName?: string;
  lines: { name: string; qty: number; unit: string; price: number; total: number }[];
  status: "pending" | "failed";
  error?: string;
};

const PREFIX = "dukaan:";
const EVENT = "dukaan-outbox";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: offline cache is a convenience, the app still works online.
  }
}

export const cache = {
  get: read,
  set: write,
  remove(key: string) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};

export function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const outboxKey = (tenantId: string) => `${tenantId}:outbox`;

export function getOutbox(tenantId: string): OutboxBill[] {
  return read<OutboxBill[]>(outboxKey(tenantId), []);
}

function setOutbox(tenantId: string, bills: OutboxBill[]) {
  write(outboxKey(tenantId), bills);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function addToOutbox(tenantId: string, bill: OutboxBill) {
  setOutbox(tenantId, [...getOutbox(tenantId), bill]);
}

export function removeFromOutbox(tenantId: string, clientId: string) {
  setOutbox(
    tenantId,
    getOutbox(tenantId).filter((b) => b.clientId !== clientId),
  );
}

export function retryOutbox(tenantId: string, clientId: string) {
  setOutbox(
    tenantId,
    getOutbox(tenantId).map((b) => (b.clientId === clientId ? { ...b, status: "pending", error: undefined } : b)),
  );
}

export function onOutboxChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

let syncing = false;

/**
 * Sends waiting bills to the server, oldest first. Stops at the first connection problem.
 * A bill the server rejects (e.g. product deleted) is marked "failed" so the user can decide.
 */
export async function syncOutbox(tenantId: string): Promise<{ sent: number; remaining: number; offline: boolean }> {
  if (syncing) return { sent: 0, remaining: getOutbox(tenantId).length, offline: false };
  syncing = true;
  let sent = 0;
  let offline = false;
  try {
    for (const bill of getOutbox(tenantId)) {
      if (bill.status !== "pending") continue;
      try {
        await api("/api/sales", {
          body: { ...bill.payload, clientId: bill.clientId, soldAt: bill.soldAt, branchId: bill.branchId },
          noRedirect: true,
        });
        removeFromOutbox(tenantId, bill.clientId);
        sent++;
      } catch (err) {
        if (err instanceof NetworkError) {
          offline = true;
          break;
        }
        if (err instanceof HttpError && err.status === 401) break; // logged out: try again after login
        setOutbox(
          tenantId,
          getOutbox(tenantId).map((b) => (b.clientId === bill.clientId ? { ...b, status: "failed", error: (err as Error).message } : b)),
        );
      }
    }
  } finally {
    syncing = false;
  }
  return { sent, remaining: getOutbox(tenantId).length, offline };
}

/** Clears cached data on logout (bills waiting to sync are kept for this shop). */
export function clearOfflineCache(tenantId?: string | null) {
  try {
    const keep = tenantId ? PREFIX + outboxKey(tenantId) : null;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && !key.endsWith(":outbox") && key !== keep) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  if ("caches" in window) {
    caches.keys().then((keys) => keys.filter((k) => k.startsWith("dukaan-pages")).forEach((k) => caches.delete(k))).catch(() => {});
  }
}

/** Opens a print window with a simple 80mm receipt (works without the server). */
export function printOfflineReceipt(opts: { shopName: string; branchName?: string; bill: OutboxBill; footer?: string }) {
  const { bill } = opts;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const money = (n: number) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n)}`;
  const rows = bill.lines
    .map((l) => `<div>${esc(l.name)}</div><div class="row"><span>&nbsp;${l.qty} ${esc(l.unit)} × ${l.price}</span><span>${money(l.total)}</span></div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>@page{size:80mm auto;margin:4mm}body{font:12px/1.4 monospace;width:72mm;margin:0 auto}
.c{text-align:center}.row{display:flex;justify-content:space-between}hr{border:0;border-top:1px dashed #000}</style></head>
<body><div class="c"><b>${esc(opts.shopName.toUpperCase())}</b>${opts.branchName ? `<div>${esc(opts.branchName)}</div>` : ""}</div><hr>
<div class="c"><b>OFFLINE BILL</b></div><div>Ref: ${esc(bill.clientId.slice(0, 8).toUpperCase())}</div>
<div>${new Date(bill.soldAt).toLocaleString("en-PK")}</div>${bill.customerName ? `<div>Customer: ${esc(bill.customerName)}</div>` : ""}<hr>
${rows}<hr><div class="row"><b>TOTAL</b><b>${money(bill.total)}</b></div>${bill.change > 0 ? `<div class="row"><span>Change</span><span>${money(bill.change)}</span></div>` : ""}<hr>
<div class="c" style="font-size:10px">Saved offline. Final bill number is given when the shop computer is back online.</div>
${opts.footer ? `<div class="c">${esc(opts.footer)}</div>` : ""}<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
