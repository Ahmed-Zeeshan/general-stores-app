import type { Error as MongooseError, Model, Types } from "mongoose";
import { ApiError } from "./api";
import { forgetBranchSetup } from "./branches";
import {
  Branch,
  Category,
  Counter,
  Device,
  Expense,
  LedgerEntry,
  Party,
  Product,
  PointsEntry,
  Production,
  Promotion,
  Purchase,
  PurchaseReturn,
  Recipe,
  Sale,
  SaleReturn,
  Reminder,
  Repair,
  Shift,
  StockBatch,
  StockLevel,
  StockMovement,
  Tenant,
  Transfer,
  UsedPurchase,
  User,
  Wallet,
  MobilePackage,
  WalletTxn,
  InstallmentPlan,
  PriceChange,
} from "@/models";

export const BACKUP_FORMAT = "dukaan-manager-backup";
export const BACKUP_VERSION = 2;

/** Collections that belong to one shop and are replaced on restore (users are never replaced). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SHOP_DATA: [string, Model<any>][] = [
  ["branches", Branch],
  ["categories", Category],
  ["products", Product],
  ["stockLevels", StockLevel],
  ["stockBatches", StockBatch],
  ["parties", Party],
  ["ledger", LedgerEntry],
  ["sales", Sale],
  ["saleReturns", SaleReturn],
  ["purchases", Purchase],
  ["purchaseReturns", PurchaseReturn],
  ["expenses", Expense],
  ["stockMovements", StockMovement],
  ["recipes", Recipe],
  ["production", Production],
  ["transfers", Transfer],
  ["reminders", Reminder],
  ["promotions", Promotion],
  ["pointsHistory", PointsEntry],
  ["shifts", Shift],
  ["devices", Device],
  ["usedPurchases", UsedPurchase],
  ["repairs", Repair],
  ["wallets", Wallet],
  ["mobilePackages", MobilePackage],
  ["walletTxns", WalletTxn],
  ["installments", InstallmentPlan],
  ["priceHistory", PriceChange],
];

/** Shop settings restored from a backup. Admin limits, status and secrets are never taken from a file. */
const RESTORABLE_SETTINGS = [
  "shopName",
  "shopType",
  "ownerName",
  "phone",
  "address",
  "ntn",
  "strn",
  "taxEnabled",
  "taxRate",
  "pricesIncludeTax",
  "receiptFooter",
  "fbrEnabled",
  "fbrMode",
  "fbrPosId",
  "fbrDefaultPct",
  "waTemplate",
  "waPaymentTemplate",
  "loyaltyEnabled",
  "requireOpenDrawer",
  "loyaltyEarnPer",
  "loyaltyPointValue",
  "loyaltyMinRedeem",
  "modules",
] as const;

/** Full JSON export of one shop's data (passwords and secrets excluded). */
export async function tenantBackup(tid: Types.ObjectId) {
  const q = { tenant: tid };
  const [tenant, users, ...rest] = await Promise.all([
    // The administrator's private notes about the shop stay out of the shop's own backup.
    Tenant.findById(tid).select("-adminNotes").lean(),
    User.find(q).lean(),
    // Product photos are left out of normal reads; a backup must keep them.
    ...SHOP_DATA.map(([, model]) => (model === Product ? model.find(q).select("+image") : model.find(q)).lean()),
  ]);
  const data: Record<string, unknown[]> = { users: users as unknown[] };
  SHOP_DATA.forEach(([name], i) => (data[name] = rest[i] as unknown[]));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    shop: tenant,
    data,
  };
}

export function backupResponse(name: string, backup: unknown) {
  const safe = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "shop";
  return new Response(JSON.stringify(backup), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="backup-${safe}-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

type BackupFile = {
  format?: string;
  version?: number;
  createdAt?: string;
  shop?: Record<string, unknown> & { _id?: string };
  data?: Record<string, unknown>;
};

const find0 = (prepared: [Model<unknown>, Record<string, unknown>[]][], model: Model<unknown>) => prepared.find(([m]) => m === model)?.[1] ?? [];

/**
 * Replaces one shop's data with a backup of that same shop.
 * Everything is validated first; nothing is deleted if the file has a problem.
 */
export async function restoreTenant(tid: Types.ObjectId, file: unknown) {
  const backup = file as BackupFile;
  if (!backup || backup.format !== BACKUP_FORMAT || !backup.data || !backup.shop) {
    throw new ApiError(400, "This is not a Dukaan Manager backup file.");
  }
  if (!backup.version || backup.version > BACKUP_VERSION) {
    throw new ApiError(400, "This backup was made by a newer version of the app. Please update the app first.");
  }
  if (String(backup.shop._id) !== String(tid)) {
    throw new ApiError(400, `This backup belongs to another shop ("${String(backup.shop.shopName ?? "unknown")}"). You can only restore a backup of this shop.`);
  }

  // 1. Build and validate every document before touching the database.
  const prepared: [Model<unknown>, Record<string, unknown>[]][] = [];
  let total = 0;
  for (const [name, model] of SHOP_DATA) {
    const raw = backup.data[name];
    if (raw === undefined) {
      prepared.push([model, []]);
      continue;
    }
    if (!Array.isArray(raw)) throw new ApiError(400, `Backup section "${name}" is damaged.`);
    const docs: Record<string, unknown>[] = [];
    for (const [i, item] of raw.entries()) {
      if (!item || typeof item !== "object") throw new ApiError(400, `Backup section "${name}" row ${i + 1} is damaged.`);
      const doc = new model({ ...(item as object), tenant: tid });
      const err = doc.validateSync();
      if (err) {
        const first = Object.values((err as MongooseError.ValidationError).errors ?? {})[0];
        throw new ApiError(400, `Backup section "${name}" row ${i + 1}: ${first?.message ?? "invalid data"}. Nothing was changed.`);
      }
      // toObject keeps the original createdAt/updatedAt (timestamps are only set on save).
      docs.push(doc.toObject({ depopulate: true }));
    }
    total += docs.length;
    prepared.push([model as Model<unknown>, docs]);
  }

  // 1b. Checks a damaged or edited file could get past the field rules: the same record twice, a record
  // that belongs to another shop, more branches than the shop's plan allows, oversized photos.
  for (const [model, docs] of prepared) {
    const ids = docs.map((d) => String(d._id));
    if (new Set(ids).size !== ids.length) throw new ApiError(400, `Backup section "${model.collection.collectionName}" has the same record twice. Nothing was changed.`);
    // Straight to the collection: the shop filter of the model would hide other shops' records.
    if (ids.length && (await model.collection.countDocuments({ _id: { $in: docs.map((d) => d._id) } as never, tenant: { $ne: tid } }, { limit: 1 }))) {
      throw new ApiError(400, "This backup contains records of another shop. Nothing was changed.");
    }
  }
  const shop = await Tenant.findById(tid).select("maxBranches").lean();
  const activeBranches = find0(prepared, Branch as Model<unknown>).filter((b) => b.active !== false).length;
  if (shop?.maxBranches && activeBranches > shop.maxBranches) {
    throw new ApiError(400, `This backup has ${activeBranches} branches but your plan allows ${shop.maxBranches}. Ask the administrator to raise the limit first. Nothing was changed.`);
  }
  if (find0(prepared, Product as Model<unknown>).some((p) => typeof p.image === "string" && p.image.length > 300_000)) {
    throw new ApiError(400, "A product photo in this backup is too large. Nothing was changed.");
  }

  // 2. Replace the shop's data.
  for (const [, model] of SHOP_DATA) await model.deleteMany({ tenant: tid });
  for (const [model, docs] of prepared) {
    if (docs.length) await model.collection.insertMany(docs, { ordered: true });
  }

  // 3. Shop settings (never the admin's limits or secrets).
  const settings: Record<string, unknown> = {};
  for (const key of RESTORABLE_SETTINGS) if (key in backup.shop) settings[key] = backup.shop[key];
  if (Object.keys(settings).length) await Tenant.updateOne({ _id: tid }, { $set: settings }, { runValidators: true });

  // 4. Continue numbering after the restored bills, purchases etc.
  const maxNo = (list: Record<string, unknown>[], field: string) =>
    list.reduce((m, d) => Math.max(m, Number(String(d[field] ?? "").split("-").pop()) || 0), 0);
  const find = (model: Model<unknown>) => prepared.find(([m]) => m === model)?.[1] ?? [];
  const counters: [string, number][] = [
    ["sale", maxNo(find(Sale as Model<unknown>), "invoiceNo")],
    ["purchase", maxNo(find(Purchase as Model<unknown>), "purchaseNo")],
    ["production", maxNo(find(Production as Model<unknown>), "productionNo")],
    ["transfer", maxNo(find(Transfer as Model<unknown>), "transferNo")],
    ["return", maxNo(find(SaleReturn as Model<unknown>), "returnNo")],
    ["purchaseReturn", maxNo(find(PurchaseReturn as Model<unknown>), "returnNo")],
    ["shift", maxNo(find(Shift as Model<unknown>), "shiftNo")],
    ["usedBuy", maxNo(find(UsedPurchase as Model<unknown>), "buyNo")],
    ["repair", maxNo(find(Repair as Model<unknown>), "jobNo")],
    ["walletTxn", maxNo(find(WalletTxn as Model<unknown>), "txnNo")],
    ["installment", maxNo(find(InstallmentPlan as Model<unknown>), "planNo")],
    ["receipt", maxNo(find(LedgerEntry as Model<unknown>).filter((e) => /^RCP-/.test(String(e.refNo ?? ""))), "refNo")],
    ["payout", maxNo(find(LedgerEntry as Model<unknown>).filter((e) => /^PAY-/.test(String(e.refNo ?? ""))), "refNo")],
  ];
  for (const [name, seq] of counters) {
    await Counter.updateOne({ _id: `${String(tid)}:${name}` }, { $set: { seq } }, { upsert: true });
  }

  // 5. Staff assigned to a branch that is not in the backup can work in all branches again.
  const branchIds = find(Branch as Model<unknown>).map((b) => b._id);
  await User.updateMany({ tenant: tid, branch: { $exists: true, $nin: branchIds } }, { $unset: { branch: 1 } });
  forgetBranchSetup(tid);

  return { restored: total, backupDate: backup.createdAt ?? null };
}
