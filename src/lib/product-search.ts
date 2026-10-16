/** Fields a product search looks at. */
export type Searchable = { name: string; nameUrdu?: string; brand?: string; fits?: string; sku?: string; barcode?: string; packs?: { barcode?: string | null }[] };

/**
 * Does the product match what was typed? An exact barcode / SKU always matches; otherwise every word
 * must appear in the name, Urdu name, brand or "fits" models — so "cover a54" finds
 * "Silicone Cover" that fits "Samsung A54".
 */
export function productMatches(p: Searchable, raw: string) {
  const term = raw.trim().toLowerCase();
  if (!term) return true;
  if (p.barcode === raw.trim() || p.sku?.toLowerCase() === term || p.packs?.some((k) => k.barcode === raw.trim())) return true;
  const hay = [p.name, p.nameUrdu, p.brand, p.fits].filter(Boolean).join(" ").toLowerCase();
  return term.split(/\s+/).every((w) => hay.includes(w));
}

/**
 * A second name (Urdu name, brand) worth showing under the product name: nothing when it only repeats
 * the name ("Aata (flour)" under "Aata (flour)"), and just the extra part when it starts with the name
 * ("Aata (flour) burhan" → "burhan").
 */
export function extraName(name: string, other?: string | null): string {
  const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
  const n = tidy(name);
  const o = tidy(other ?? "");
  if (!o) return "";
  const nl = n.toLowerCase();
  const ol = o.toLowerCase();
  if (ol === nl || nl.includes(ol)) return "";
  if (ol.startsWith(nl)) return o.slice(n.length).replace(/^[\s\-–—:·,/]+/, "");
  return o;
}
