import type { Types } from "mongoose";
import { Category } from "@/models";

/** Attaches `category: {_id, name}` to products (manual join; populate would bypass the tenant guard). */
export async function withCategories<T extends { category?: unknown }>(tid: Types.ObjectId, products: T[]) {
  const ids = [...new Set(products.map((p) => p.category && String(p.category)).filter(Boolean))];
  if (!ids.length) return products.map((p) => ({ ...p, category: null }));
  const cats = await Category.find({ tenant: tid, _id: { $in: ids } }).select("name").lean();
  const byId = new Map(cats.map((c) => [String(c._id), { _id: c._id, name: c.name }]));
  return products.map((p) => ({ ...p, category: p.category ? byId.get(String(p.category)) ?? null : null }));
}
