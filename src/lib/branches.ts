import { cookies } from "next/headers";
import { Types } from "mongoose";
import { ApiError, requireTenant, type TenantContext } from "./api";
import type { ShopRole } from "./session";
import { Branch, Expense, Product, Production, Purchase, Sale, StockLevel, StockMovement } from "@/models";
import { migrateLegacyReturns } from "./returns";

export const BRANCH_COOKIE = "dukaan_branch";

const ensured = new Set<string>();

/** Makes the next request re-check the shop's branches (e.g. after a restore). */
export function forgetBranchSetup(tid: Types.ObjectId) {
  ensured.delete(String(tid));
}

/**
 * Every shop has at least one branch. Shops created before branches existed are upgraded here
 * once: a "Main Branch" is created, existing stock is moved into it and old records are tagged.
 */
export async function ensureMainBranch(tid: Types.ObjectId) {
  const key = String(tid);
  if (ensured.has(key)) return;
  let main = await Branch.findOne({ tenant: tid, isMain: true }).lean();
  if (!main) {
    try {
      main = (await Branch.create({ tenant: tid, name: "Main Branch", isMain: true })).toObject();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      main = await Branch.findOne({ tenant: tid, isMain: true }).lean();
    }
  }
  if (!main) throw new Error("Could not create the main branch");
  // Products that have stock but no per-branch level yet: put their stock in the main branch.
  const withLevels = new Set((await StockLevel.find({ tenant: tid }).select("product").lean()).map((l) => String(l.product)));
  const products = await Product.find({ tenant: tid, stock: { $ne: 0 } }).select("stock").lean();
  const missing = products.filter((p) => !withLevels.has(String(p._id)));
  if (missing.length) {
    await StockLevel.insertMany(missing.map((p) => ({ tenant: tid, product: p._id, branch: main!._id, qty: p.stock })), { ordered: false }).catch(() => {});
  }
  const untagged = { tenant: tid, branch: { $exists: false } };
  await Promise.all([
    Sale.updateMany(untagged, { branch: main._id, branchName: main.name }),
    Purchase.updateMany(untagged, { branch: main._id, branchName: main.name }),
    Production.updateMany(untagged, { branch: main._id, branchName: main.name }),
    Expense.updateMany(untagged, { branch: main._id }),
    StockMovement.updateMany(untagged, { branch: main._id }),
  ]);
  await migrateLegacyReturns(tid);
  ensured.add(key);
}

export type BranchLite = { _id: Types.ObjectId; name: string; address?: string | null; phone?: string | null; isMain?: boolean | null };
export type BranchContext = TenantContext & {
  branchId: Types.ObjectId;
  branch: BranchLite;
  branches: BranchLite[];
  /** True when the user is assigned to one branch and cannot switch. */
  locked: boolean;
};

/** Tenant context plus the branch this request works in (assigned branch, chosen branch, or main). */
export async function requireBranch(roles?: ShopRole[]): Promise<BranchContext> {
  return branchContext(await requireTenant(roles));
}

/** The branch a known shop user works in (used right after login, before the login cookie exists). */
export async function branchContext(ctx: TenantContext): Promise<BranchContext> {
  await ensureMainBranch(ctx.tid);
  const branches = (await Branch.find({ tenant: ctx.tid, active: true }).sort({ isMain: -1, name: 1 }).select("name address phone isMain").lean()) as BranchLite[];
  const byId = new Map(branches.map((b) => [String(b._id), b]));
  let branch: BranchLite | undefined;
  let locked = false;
  if (ctx.user.branchId) {
    branch = byId.get(ctx.user.branchId);
    if (!branch) throw new ApiError(403, "Your branch is closed. Ask the shop owner to move you to another branch.");
    locked = true;
  } else {
    const chosen = (await cookies()).get(BRANCH_COOKIE)?.value;
    branch = (chosen && byId.get(chosen)) || branches.find((b) => b.isMain) || branches[0];
  }
  if (!branch) throw new ApiError(500, "This shop has no active branch.");
  return { ...ctx, branchId: branch._id, branch, branches, locked };
}

/**
 * Branch filter for reports: "all" (owner/manager not locked to a branch), a specific branch,
 * or the current branch when nothing is given.
 */
/**
 * Staff locked to a branch, and cashiers, only see and change records of the branch they are working in
 * (looked up by id, a record of another branch is "not found" for them).
 */
export function assertBranchAccess(ctx: BranchContext, branch: unknown, what = "Record") {
  if ((ctx.locked || ctx.user.role === "cashier") && branch && String(branch) !== String(ctx.branchId)) throw new ApiError(404, `${what} not found.`);
}

export function reportBranchFilter(ctx: BranchContext, param: string | null): Types.ObjectId | null {
  if (ctx.locked || ctx.user.role === "cashier") return ctx.branchId;
  if (param === "all") return null;
  if (param && Types.ObjectId.isValid(param)) {
    const b = ctx.branches.find((x) => String(x._id) === param);
    if (!b) throw new ApiError(404, "Branch not found.");
    return b._id;
  }
  return ctx.branchId;
}

/** Stock of the given products at one branch (missing = 0). */
export async function branchStock(tid: Types.ObjectId, branch: Types.ObjectId, productIds?: Types.ObjectId[]) {
  const q: Record<string, unknown> = { tenant: tid, branch };
  if (productIds) q.product = { $in: productIds };
  const levels = await StockLevel.find(q).select("product qty").lean();
  return new Map(levels.map((l) => [String(l.product), l.qty]));
}
