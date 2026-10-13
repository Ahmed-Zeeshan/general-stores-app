import { z } from "zod";
import { ApiError, escapeRegex, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { moveStock } from "@/lib/services";
import { STARTER_ITEMS } from "@/lib/starter-items";
import { UNITS } from "@/lib/constants";
import { Category, Product, Tenant } from "@/models";

/** The ready-made item list for this shop type; items the shop already has are marked. */
export const GET = handle(async () => {
  const { tid } = await requireBranch(["owner", "manager"]);
  const tenant = await Tenant.findById(tid).select("shopType").lean();
  const list = STARTER_ITEMS[tenant?.shopType ?? "general"] ?? STARTER_ITEMS.general;
  const existing = await Product.find({ tenant: tid, name: { $in: list.map((i) => new RegExp(`^${escapeRegex(i.name)}$`, "i")) } })
    .select("name")
    .lean();
  const have = new Set(existing.map((p) => p.name.toLowerCase()));
  return list.map((i) => ({ ...i, exists: have.has(i.name.toLowerCase()) }));
});

const Body = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        nameUrdu: z.string().trim().max(120).optional(),
        unit: z.enum(UNITS),
        category: z.string().trim().max(60).optional(),
        salePrice: z.coerce.number().positive("Enter the sale price"),
        costPrice: z.coerce.number().min(0).default(0),
        openingStock: z.coerce.number().min(0).default(0),
      }),
    )
    .min(1, "Choose at least one item")
    .max(200),
});

/** Adds the chosen ready-made items with the shop's own prices (and stock, if given). */
export const POST = handle(async (req) => {
  const { tid, user, branchId } = await requireBranch(["owner", "manager"]);
  const { items } = Body.parse(await req.json());
  const cats = await Category.find({ tenant: tid }).select("name").lean();
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c._id]));
  let created = 0;
  const skipped: string[] = [];
  for (const i of items) {
    if (await Product.exists({ tenant: tid, name: new RegExp(`^${escapeRegex(i.name)}$`, "i") })) {
      skipped.push(i.name);
      continue;
    }
    let category = i.category ? catByName.get(i.category.toLowerCase()) : undefined;
    if (i.category && !category) {
      const c = await Category.create({ tenant: tid, name: i.category });
      category = c._id;
      catByName.set(i.category.toLowerCase(), c._id);
    }
    const p = await Product.create({ tenant: tid, name: i.name, nameUrdu: i.nameUrdu, unit: i.unit, category, salePrice: i.salePrice, costPrice: i.costPrice, lowStockAlert: i.unit === "kg" ? 5 : 3, stock: 0 });
    if (i.openingStock > 0) await moveStock({ tid, branch: branchId, productId: p._id, qty: i.openingStock, type: "opening", note: "Opening stock", userId: user.id });
    created++;
  }
  if (!created && skipped.length) throw new ApiError(400, "All the chosen items are already in your products.");
  await logActivity({ tid, user, branchId }, { action: "product.import", summary: `${created} ready-made items added${skipped.length ? ` (${skipped.length} already there)` : ""}`, refType: "product" });
  return { created, skipped };
});
