import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { branchStock, requireBranch } from "@/lib/branches";
import { UNITS } from "@/lib/constants";
import { parseCsv } from "@/lib/csv";
import { moveStock } from "@/lib/services";
import { Category, Product } from "@/models";

const Body = z.object({ csv: z.string().min(1, "The file is empty").max(5_000_000, "File is too large (max 5 MB)") });

const UNIT_ALIASES: Record<string, string> = { piece: "pcs", pc: "pcs", kilo: "kg", gram: "g", liter: "litre", l: "litre" };

/**
 * Imports products from CSV (same columns as the export). Existing products are matched by
 * barcode, then by name, and updated; new ones are created. Stock is set to the CSV value.
 */
export const POST = handle(async (req) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const rows = parseCsv(Body.parse(await req.json()).csv);
  if (rows.length < 2) throw new ApiError(400, "The file has no product rows.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  if (col("name") < 0 || col("saleprice") < 0) throw new ApiError(400, 'The first row must contain the column names, including "name" and "salePrice".');
  if (rows.length > 5001) throw new ApiError(400, "Please import at most 5000 products at a time.");

  const categories = await Category.find({ tenant: tid }).lean();
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c._id]));
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const get = (name: string) => (col(name) >= 0 ? (rows[r][col(name)] ?? "").trim() : "");
    const num = (name: string, fallback?: number) => {
      const v = get(name).replace(/,/g, "");
      if (v === "") return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };
    const line = r + 1;
    const name = get("name");
    if (!name) {
      errors.push(`Row ${line}: name is empty`);
      continue;
    }
    const unitRaw = get("unit").toLowerCase() || "pcs";
    const unit = UNIT_ALIASES[unitRaw] ?? unitRaw;
    if (!(UNITS as readonly string[]).includes(unit)) {
      errors.push(`Row ${line} (${name}): unknown unit "${unitRaw}"`);
      continue;
    }
    const salePrice = num("salePrice");
    const costPrice = num("costPrice", 0);
    const stock = num("stock");
    const lowStockAlert = num("lowStockAlert", 5);
    if (salePrice === undefined || [salePrice, costPrice, lowStockAlert].some((n) => n === undefined || Number.isNaN(n) || (n as number) < 0) || (stock !== undefined && Number.isNaN(stock))) {
      errors.push(`Row ${line} (${name}): prices and quantities must be numbers`);
      continue;
    }
    const expiryRaw = get("expiryDate");
    const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
    if (expiryDate && Number.isNaN(expiryDate.getTime())) {
      errors.push(`Row ${line} (${name}): expiry date must look like 2026-12-31`);
      continue;
    }

    let category = undefined;
    const catName = get("category");
    if (catName) {
      category = catByName.get(catName.toLowerCase());
      if (!category) {
        const c = await Category.create({ tenant: tid, name: catName });
        category = c._id;
        catByName.set(catName.toLowerCase(), c._id);
      }
    }

    const barcode = get("barcode");
    const data: Record<string, unknown> = {
      name,
      nameUrdu: get("nameUrdu") || undefined,
      unit,
      costPrice,
      salePrice,
      lowStockAlert,
      category,
      expiryDate,
      pctCode: get("pctCode") || undefined,
      active: true,
    };
    if (barcode) data.barcode = barcode;

    try {
      const existing =
        (barcode && (await Product.findOne({ tenant: tid, barcode }).lean())) ||
        (await Product.findOne({ tenant: tid, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean());
      let productId;
      let currentStock = 0;
      if (existing) {
        await Product.updateOne({ _id: existing._id, tenant: tid }, { $set: data });
        productId = existing._id;
        currentStock = (await branchStock(tid, branchId, [existing._id])).get(String(existing._id)) ?? 0;
        updated++;
      } else {
        const p = await Product.create({ ...data, tenant: tid, stock: 0 });
        productId = p._id;
        created++;
      }
      if (stock !== undefined && stock !== currentStock) {
        await moveStock({ tid, branch: branchId, productId, qty: stock - currentStock, type: "import", note: "CSV import", userId: user.id });
      }
    } catch (err) {
      errors.push(`Row ${line} (${name}): ${(err as { code?: number }).code === 11000 ? "barcode already used by another product" : (err as Error).message}`);
    }
  }
  await logActivity({ tid, user, branchId }, { action: "product.import", summary: `Imported products from a file: ${created} new, ${updated} updated${errors.length ? `, ${errors.length} rows with errors` : ""}` });
  return { created, updated, errors: errors.slice(0, 50), errorCount: errors.length };
});
