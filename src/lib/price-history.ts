import type { Types } from "mongoose";
import { PriceChange } from "@/models/PriceChange";

type Prices = { _id?: unknown; salePrice?: number | null; wholesalePrice?: number | null; costPrice?: number | null } | null | undefined;
type Source = "added" | "edit" | "purchase" | "import" | "bulk" | "production";
const FIELDS = ["salePrice", "wholesalePrice", "costPrice"] as const;
const same = (a?: number | null, b?: number | null) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005;

/**
 * Records every price of `after` that differs from `before` (a new item: `before` = null records its
 * first prices). Never fails the change it belongs to.
 */
export async function recordPriceChanges(
  ctx: { tid: Types.ObjectId; user?: { id: string; name: string } },
  productId: unknown,
  before: Prices,
  after: Prices,
  source: Source,
  refNo?: string,
  refId?: unknown,
) {
  try {
    const rows = FIELDS.filter((f) => after && after[f] !== undefined && (before ? !same(before[f], after[f]) : (after[f] ?? 0) > 0)).map((f) => ({
      tenant: ctx.tid,
      product: productId,
      field: f,
      from: before ? (before[f] ?? null) : null,
      to: after![f] ?? null,
      source,
      refNo,
      refId,
      user: ctx.user?.id,
      userName: ctx.user?.name,
    }));
    if (rows.length) await PriceChange.insertMany(rows);
  } catch (err) {
    console.error("price history", err);
  }
}
