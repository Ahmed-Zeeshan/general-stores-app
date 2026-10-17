/** Price rules shared by the POS screen and the server (no database code here). */

export type PackLike = { name: string; size: number; price?: number | null; wholesalePrice?: number | null; barcode?: string | null };
export type PricedProduct = { salePrice: number; wholesalePrice?: number | null; packs?: PackLike[] | null };

const positive = (n?: number | null) => (typeof n === "number" && n > 0 ? n : 0);

/** Price of one loose unit (piece / kg …) for a retail or wholesale customer. */
export function unitPrice(p: PricedProduct, wholesale: boolean) {
  return wholesale && positive(p.wholesalePrice) ? positive(p.wholesalePrice) : p.salePrice;
}

/**
 * Price of what is sold: one unit, or one pack (carton, dozen …). A pack without its own price
 * costs its size × the unit price. A customer's own special price for the item (per loose unit)
 * comes first, before wholesale and the normal price.
 */
export function sellPrice(p: PricedProduct, pack: PackLike | null | undefined, wholesale: boolean, special?: number | null) {
  const own = positive(special);
  if (own) return pack ? Math.round(own * pack.size * 100) / 100 : own;
  if (!pack) return unitPrice(p, wholesale);
  if (wholesale && positive(pack.wholesalePrice)) return positive(pack.wholesalePrice);
  if (positive(pack.price)) return positive(pack.price);
  return Math.round(unitPrice(p, wholesale) * pack.size * 100) / 100;
}

/** A customer's special prices as product id → price per loose unit. */
export function specialPrices(customer?: { prices?: { product: unknown; price: number }[] | null } | null) {
  return new Map((customer?.prices ?? []).map((x) => [String(x.product), x.price]));
}

export function findPack(p: PricedProduct, name?: string | null) {
  if (!name) return null;
  return p.packs?.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? null;
}
