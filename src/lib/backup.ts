import type { Types } from "mongoose";
import { Category, Expense, LedgerEntry, Party, Product, Production, Purchase, Recipe, Sale, StockMovement, Tenant, User } from "@/models";

/** Full JSON export of one shop's data (passwords and FBR token excluded). */
export async function tenantBackup(tid: Types.ObjectId) {
  const q = { tenant: tid };
  const [tenant, users, categories, products, parties, ledger, sales, purchases, expenses, stockMovements, recipes, production] = await Promise.all([
    Tenant.findById(tid).lean(),
    User.find(q).lean(),
    Category.find(q).lean(),
    Product.find(q).lean(),
    Party.find(q).lean(),
    LedgerEntry.find(q).lean(),
    Sale.find(q).lean(),
    Purchase.find(q).lean(),
    Expense.find(q).lean(),
    StockMovement.find(q).lean(),
    Recipe.find(q).lean(),
    Production.find(q).lean(),
  ]);
  return {
    format: "dukaan-manager-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    shop: tenant,
    data: { users, categories, products, parties, ledger, sales, purchases, expenses, stockMovements, recipes, production },
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
