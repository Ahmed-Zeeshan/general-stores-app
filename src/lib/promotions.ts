/**
 * Promotion rules shared by the POS screen (preview) and the server (what is actually saved).
 * No database code here.
 */

export type PromoLike = {
  _id: string;
  name: string;
  kind: "percent" | "amount" | "bxgy" | "bill";
  value?: number | null;
  billMode?: "percent" | "amount" | null;
  buyQty?: number | null;
  freeQty?: number | null;
  minAmount?: number | null;
  maxDiscount?: number | null;
  appliesTo?: "all" | "products" | "categories" | null;
  products?: string[] | null;
  categories?: string[] | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  active?: boolean | null;
};

/** One bill line as the promotion rules see it. */
export type PromoLine = {
  productId: string;
  categoryId?: string | null;
  /** Units sold (packs already converted to units). */
  qty: number;
  /** Price of one unit. */
  unitPrice: number;
  /** Line value before any discount. */
  gross: number;
  /** Discount already typed by hand on this line. */
  manualDiscount: number;
  /** Sold as a pack (carton): buy-X-get-Y does not apply. */
  isPack?: boolean;
  /** Price typed by hand (owner): no automatic offers on this line. */
  customPrice?: boolean;
};

export type LinePromo = { id: string; name: string; discount: number } | null;
export type BillPromo = { id: string; name: string; discount: number } | null;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function isRunning(p: PromoLike, now = new Date()) {
  if (p.active === false) return false;
  if (p.startsAt && new Date(p.startsAt) > now) return false;
  // An end date means "until the end of that day".
  if (p.endsAt) {
    const end = new Date(p.endsAt);
    if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) end.setUTCHours(23, 59, 59, 999);
    if (end < now) return false;
  }
  return true;
}

function covers(p: PromoLike, line: PromoLine) {
  if (p.appliesTo === "products") return (p.products ?? []).map(String).includes(line.productId);
  if (p.appliesTo === "categories") return !!line.categoryId && (p.categories ?? []).map(String).includes(line.categoryId);
  return true;
}

function lineDiscount(p: PromoLike, line: PromoLine) {
  const room = Math.max(0, line.gross - line.manualDiscount);
  let d = 0;
  if (p.kind === "percent") d = (room * Math.min(100, p.value ?? 0)) / 100;
  else if (p.kind === "amount") d = Math.min(line.unitPrice, p.value ?? 0) * line.qty;
  else if (p.kind === "bxgy" && !line.isPack) {
    const buy = Math.max(1, Math.floor(p.buyQty ?? 0));
    const free = Math.max(1, Math.floor(p.freeQty ?? 0));
    const groups = Math.floor(line.qty / (buy + free));
    d = groups * free * line.unitPrice;
  }
  return r2(Math.min(room, Math.max(0, d)));
}

/**
 * Best offer for each line (offers do not stack on one line), then the best bill offer on what
 * is left. Wholesale customers do not get offers.
 */
export function applyPromotions(lines: PromoLine[], promos: PromoLike[], opts: { wholesale?: boolean; now?: Date } = {}) {
  const running = opts.wholesale ? [] : promos.filter((p) => isRunning(p, opts.now));
  const itemPromos = running.filter((p) => p.kind !== "bill");
  const perLine: LinePromo[] = lines.map((line) => {
    if (line.customPrice) return null;
    let best: LinePromo = null;
    for (const p of itemPromos) {
      if (!covers(p, line)) continue;
      const d = lineDiscount(p, line);
      if (d > 0 && (!best || d > best.discount)) best = { id: String(p._id), name: p.name, discount: d };
    }
    return best;
  });
  const afterLines = r2(lines.reduce((a, l, i) => a + l.gross - l.manualDiscount - (perLine[i]?.discount ?? 0), 0));
  let bill: BillPromo = null;
  for (const p of running.filter((x) => x.kind === "bill")) {
    if (afterLines < (p.minAmount ?? 0) || afterLines <= 0) continue;
    let d = p.billMode === "amount" ? p.value ?? 0 : (afterLines * Math.min(100, p.value ?? 0)) / 100;
    if (p.maxDiscount && p.maxDiscount > 0) d = Math.min(d, p.maxDiscount);
    d = r2(Math.min(afterLines, Math.max(0, d)));
    if (d > 0 && (!bill || d > bill.discount)) bill = { id: String(p._id), name: p.name, discount: d };
  }
  return { lines: perLine, bill };
}

/** Points earned on what was paid now (udhaar does not earn until it is paid). */
export function pointsEarned(paid: number, earnPer: number) {
  return earnPer > 0 ? Math.floor(Math.max(0, paid) / earnPer) : 0;
}
