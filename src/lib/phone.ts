/**
 * Pakistani phone numbers, shared by the forms and the server. Customer numbers are used for WhatsApp
 * reminders, so they must be mobile numbers; suppliers may also have a landline.
 */

/** "03001234567", "0300-1234567", "+92 300 1234567", "923001234567", "0092…" → "0300-1234567"; anything else → null. */
export function normalizeMobile(input: string): string | null {
  const s = input.trim();
  if (!/^[+\d\s\-().]+$/.test(s)) return null;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? `0${d.slice(0, 3)}-${d.slice(3)}` : null;
}

/** A landline with its city code, e.g. "042-35123456" or "051 1234567" (kept as typed, spaces tidied). */
function normalizeLandline(input: string): string | null {
  const s = input.trim().replace(/\s+/g, " ");
  if (!/^[+\d\s\-()]+$/.test(s)) return null;
  const d = s.replace(/\D/g, "").replace(/^0092|^92/, "0");
  return /^0[1-9]\d{7,10}$/.test(d) && !/^03/.test(d) ? s : null;
}

export const PHONE_HINT = "Mobile number, e.g. 0300-1234567 or +92 300 1234567";

/**
 * Checks a customer's or supplier's phone. Empty is allowed (no phone).
 * Returns { phone } with the tidy number, or { error } with what to fix.
 */
export function checkPartyPhone(type: "customer" | "supplier", input: string | undefined | null): { phone?: string; error?: string } {
  const raw = (input ?? "").trim();
  if (!raw) return {};
  const mobile = normalizeMobile(raw);
  if (mobile) return { phone: mobile };
  if (type === "supplier") {
    const land = normalizeLandline(raw);
    if (land) return { phone: land };
    return { error: "Enter a mobile number (0300-1234567) or a landline with its city code (042-35123456)." };
  }
  return { error: "Enter a Pakistani mobile number, e.g. 0300-1234567 or +92 300 1234567." };
}
