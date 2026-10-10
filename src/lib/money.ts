/** Round to 2 decimals to avoid floating point drift (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatPKR(n: number | undefined | null, opts: { symbol?: boolean } = {}): string {
  // `|| 0` turns -0 into 0 so we never print "Rs -0".
  const value = round2(Number(n ?? 0)) || 0;
  const fraction = Number.isInteger(value) ? 0 : 2;
  const formatted = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(value);
  // A non-breaking space keeps "Rs" and the amount together on narrow screens and in table cells.
  return opts.symbol === false ? formatted : `Rs\u00a0${formatted}`;
}

export function formatQty(n: number): string {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 3 }).format(n);
}
