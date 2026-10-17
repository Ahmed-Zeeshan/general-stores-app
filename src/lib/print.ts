"use client";

/** Printing preferences of this computer (each counter has its own printer). */
export type PrintPrefs = { auto: boolean; udhaarCopy: boolean; paper: "80" | "58" };
const KEY = "dukaan:print";
const DEFAULTS: PrintPrefs = { auto: false, udhaarCopy: false, paper: "80" };

export function getPrintPrefs(): PrintPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<PrintPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function setPrintPrefs(p: Partial<PrintPrefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getPrintPrefs(), ...p }));
  } catch {
    /* ignore */
  }
}

/**
 * Prints a page (e.g. a receipt with ?print=1) through a hidden frame: no pop-up window, so it
 * also works right after saving a bill. With Chrome's --kiosk-printing it prints silently.
 */
export function printInFrame(url: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = url;
  document.body.appendChild(frame);
  // Remove it once printed (or after a minute if the print dialog was left open).
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.addEventListener("load", () => frame.contentWindow?.addEventListener("afterprint", cleanup));
  setTimeout(() => frame.remove(), 60_000);
}

/** Receipt address for a bill with this computer's preferences (second copy for udhaar bills). */
export function receiptUrl(saleId: string, opts: { print?: boolean; creditAmount?: number; original?: boolean } = {}) {
  const prefs = getPrintPrefs();
  const params = new URLSearchParams();
  if (opts.print) params.set("print", "1");
  if (opts.original) params.set("original", "1");
  if (prefs.udhaarCopy && (opts.creditAmount ?? 0) > 0) params.set("copies", "2");
  const qs = params.toString();
  return `/receipt/${saleId}${qs ? `?${qs}` : ""}`;
}

/** Set once a test receipt has been opened on this computer (for the setup guide). */
export const PRINTER_TESTED_KEY = "dukaan:printer-tested";
