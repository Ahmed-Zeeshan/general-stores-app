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
 * costs its size × the unit price.
 */
export function sellPrice(p: PricedProduct, pack: PackLike | null | undefined, wholesale: boolean) {
  if (!pack) return unitPrice(p, wholesale);
  if (wholesale && positive(pack.wholesalePrice)) return positive(pack.wholesalePrice);
  if (positive(pack.price)) return positive(pack.price);
  return Math.round(unitPrice(p, wholesale) * pack.size * 100) / 100;
}

export function findPack(p: PricedProduct, name?: string | null) {
  if (!name) return null;
  return p.packs?.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? null;
}
