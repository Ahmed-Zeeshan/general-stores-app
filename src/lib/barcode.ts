/** Barcode helpers shared by the server and the browser (no database imports here). */

/** GS1 check digit for EAN-8 / EAN-13 / UPC-A data digits (without the check digit). */
export function gs1CheckDigit(digits: string) {
  let sum = 0;
  const rev = digits.split("").reverse();
  rev.forEach((d, i) => (sum += Number(d) * (i % 2 === 0 ? 3 : 1)));
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan13(code: string) {
  return /^\d{13}$/.test(code) && gs1CheckDigit(code.slice(0, 12)) === code[12];
}

export function isValidEan8(code: string) {
  return /^\d{8}$/.test(code) && gs1CheckDigit(code.slice(0, 7)) === code[7];
}

/**
 * In-store EAN-13: "20" + 10-digit number + check digit. GS1 reserves prefixes 20–29 for
 * a shop's own use, so these never clash with manufacturers' barcodes.
 */
export function inStoreEan13(seq: number) {
  const body = "20" + String(seq).padStart(10, "0");
  return body + gs1CheckDigit(body);
}

/** Which symbology to print a code with. */
export function barcodeFormat(code: string): "EAN13" | "EAN8" | "CODE128" {
  if (isValidEan13(code)) return "EAN13";
  if (isValidEan8(code)) return "EAN8";
  return "CODE128";
}
