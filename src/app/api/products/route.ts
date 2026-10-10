import { z } from "zod";
import { ApiError, escapeRegex, handle, requireTenant } from "@/lib/api";
import { withCategories } from "@/lib/categories";
import { ProductInput } from "@/lib/schemas";
import { moveStock } from "@/lib/services";
import { Product } from "@/models";

export const GET = handle(async (req) => {
  const { tid } = await requireTenant();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category");
  const filter = url.searchParams.get("filter"); // low | expiring | inactive
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 5000);

  const query: Record<string, unknown> = { tenant: tid, active: filter === "inactive" ? false : true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ name: rx }, { nameUrdu: rx }, { barcode: q }, { sku: rx }];
  }
  if (category) query.category = category;
  if (filter === "low") query.$expr = { $lte: ["$stock", "$lowStockAlert"] };
  if (filter === "expiring") {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    query.expiryDate = { $ne: null, $lte: soon };
  }
  const products = await Product.find(query).sort({ name: 1 }).limit(limit).lean();
  return withCategories(tid, products);
});

export const POST = handle(async (req) => {
  const { user, tid } = await requireTenant(["owner", "manager"]);
  const raw = await req.json();
  const body = ProductInput.parse(raw);
  const openingStock = z.coerce.number().min(0).optional().parse(raw.openingStock) ?? 0;
  if (body.barcode && (await Product.exists({ tenant: tid, barcode: body.barcode }))) {
    throw new ApiError(409, `Barcode ${body.barcode} is already used by another product.`);
  }
  const product = await Product.create({ ...body, tenant: tid, barcode: body.barcode || undefined, stock: 0 });
  if (openingStock > 0) {
    await moveStock({ tid, productId: product._id, qty: openingStock, type: "opening", note: "Opening stock", userId: user.id });
  }
  return Product.findOne({ _id: product._id, tenant: tid }).lean();
});
