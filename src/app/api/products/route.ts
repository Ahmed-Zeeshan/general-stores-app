import { ApiError, escapeRegex, handle, requireUser } from "@/lib/api";
import { ProductInput } from "@/lib/schemas";
import { moveStock } from "@/lib/services";
import { Product } from "@/models";
import { z } from "zod";

export const GET = handle(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category");
  const filter = url.searchParams.get("filter"); // low | expiring | inactive
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);

  const query: Record<string, unknown> = { active: filter === "inactive" ? false : true };
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
  return Product.find(query).populate("category", "name color").sort({ name: 1 }).limit(limit).lean();
});

export const POST = handle(async (req) => {
  const user = await requireUser(["owner", "manager"]);
  const raw = await req.json();
  const body = ProductInput.parse(raw);
  const openingStock = z.coerce.number().min(0).optional().parse(raw.openingStock) ?? 0;
  if (body.barcode && (await Product.exists({ barcode: body.barcode }))) {
    throw new ApiError(409, `Barcode ${body.barcode} is already used by another product.`);
  }
  const product = await Product.create({ ...body, barcode: body.barcode || undefined, stock: 0 });
  if (openingStock > 0) {
    await moveStock({ productId: product._id, qty: openingStock, type: "opening", note: "Opening stock", userId: user.id });
  }
  return Product.findById(product._id).lean();
});
