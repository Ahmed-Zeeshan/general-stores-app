/** IMEI helpers shared by the server and the pages (no database code here). */

/** Spaces and dashes people type or scanners add are ignored; letters are kept (serial numbers). */
export function cleanImei(raw: string) {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

/** True when a 15-digit IMEI passes its check digit (other serial numbers are not checked). */
export function imeiCheckOk(imei: string) {
  if (!/^\d{15}$/.test(imei)) return true;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export const IMEI_RE = /^[A-Z0-9]{4,30}$/;

/** `blocking` problems must be fixed; a wrong check digit is only a warning (some phones have odd IMEIs). */
export type ImeiLine = { imei: string; imei2?: string; problem?: string; blocking?: boolean };

/**
 * Reads IMEIs typed or scanned one phone per line. A second IMEI can follow on the same line after a
 * comma, slash or semicolon ("35…12, 35…34"); spaces inside a number are ignored. Returns each phone
 * with any problem found.
 */
export function parseImeiLines(text: string): ImeiLine[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      let parts = l.split(/[,;/|\t]+/).map(cleanImei).filter(Boolean);
      // Two 15-digit IMEIs run together (scanned without a separator).
      if (parts.length === 1 && /^\d{30}$/.test(parts[0]) && imeiCheckOk(parts[0].slice(0, 15)) && imeiCheckOk(parts[0].slice(15))) {
        parts = [parts[0].slice(0, 15), parts[0].slice(15)];
      }
      const [imei, imei2] = parts;
      let problem: string | undefined;
      let blocking = false;
      if (!IMEI_RE.test(imei ?? "")) [problem, blocking] = ["not a valid IMEI / serial", true];
      else if (imei2 && !IMEI_RE.test(imei2)) [problem, blocking] = ["second IMEI not valid", true];
      else if (!imeiCheckOk(imei) || (imei2 && !imeiCheckOk(imei2))) problem = "check digit wrong — re-check the number";
      for (const x of [imei, imei2]) {
        if (!x) continue;
        if (seen.has(x)) [problem, blocking] = ["entered twice", true];
        seen.add(x);
      }
      return { imei: imei ?? "", ...(imei2 ? { imei2 } : {}), ...(problem ? { problem, blocking } : {}) };
    });
}

export const CONDITION_LABELS: Record<string, string> = { new: "New", used: "Used", refurbished: "Refurbished" };
export const PTA_LABELS: Record<string, string> = { approved: "PTA approved", non_pta: "Non-PTA", unknown: "PTA not checked" };
