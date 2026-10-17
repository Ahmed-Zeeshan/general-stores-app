import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Party, Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** A customer's special prices, with the item's name and normal prices beside each one. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const party = await Party.findOne({ _id: id, tenant: tid, type: "customer" }).select("prices").lean();
  if (!party) throw new ApiError(404, "Customer not found.");
  const list = party.prices ?? [];
  const products = await Product.find({ tenant: tid, _id: { $in: list.map((x) => x.product) } })
    .select("name nameUrdu unit salePrice wholesalePrice active")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return list
    .map((x) => ({ x, p: byId.get(String(x.product)) }))
    .filter(({ p }) => p)
    .map(({ x, p }) => ({ productId: String(p!._id), name: p!.name, nameUrdu: p!.nameUrdu, unit: p!.unit, salePrice: p!.salePrice, wholesalePrice: p!.wholesalePrice, active: p!.active, price: x.price }));
});

const Body = z.object({
  prices: z
    .array(z.object({ productId: z.string().regex(/^[a-f0-9]{24}$/i), price: z.coerce.number().positive("Special price must be more than zero").max(10_000_000) }))
    .max(500, "Up to 500 special prices per customer"),
});

/** Saves the whole list (owner / manager). */
export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const { prices } = Body.parse(await req.json());
  const party = await Party.findOne({ _id: id, tenant: tid, type: "customer" }).select("name prices").lean();
  if (!party) throw new ApiError(404, "Customer not found.");
  const ids = [...new Set(prices.map((x) => x.productId))];
  if (ids.length !== prices.length) throw new ApiError(400, "The same item is in the list twice.");
  const products = await Product.find({ tenant: tid, _id: { $in: ids } }).select("name trackSerial").lean();
  if (products.length !== ids.length) throw new ApiError(400, "One of the items was not found. Please refresh.");
  const phone = products.find((p) => p.trackSerial);
  if (phone) throw new ApiError(400, `${phone.name} is sold by IMEI, each phone at its own price — it cannot have a special price.`);
  const names = new Map(products.map((p) => [String(p._id), p.name]));

  const before = new Map((party.prices ?? []).map((x) => [String(x.product), x.price]));
  await Party.updateOne({ _id: id, tenant: tid }, { $set: { prices: prices.map((x) => ({ product: x.productId, price: x.price })) } });

  // What changed, for the activity log.
  const changes: string[] = [];
  for (const x of prices) {
    const old = before.get(x.productId);
    if (old === undefined) changes.push(`${names.get(x.productId)} Rs ${x.price}`);
    else if (old !== x.price) changes.push(`${names.get(x.productId)} Rs ${old} → ${x.price}`);
  }
  const removed = [...before.keys()].filter((k) => !ids.includes(k)).length;
  if (removed) changes.push(`${removed} removed`);
  if (changes.length) {
    await logActivity({ tid, user }, { action: "party.prices", summary: `Special prices for ${party.name}: ${changes.join(", ")}`, refType: "party", refId: party._id });
  }
  return { ok: true, count: prices.length };
});
