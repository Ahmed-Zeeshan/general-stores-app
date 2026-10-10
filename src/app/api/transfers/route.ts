import { z } from "zod";
import { ApiError, dateRange, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { branchStock, requireBranch } from "@/lib/branches";
import { moveStock } from "@/lib/services";
import { nextNumber, Product, Transfer } from "@/models";

export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { from, to } = dateRange(new URL(req.url), 29);
  const filter: Record<string, unknown> = { tenant: ctx.tid, createdAt: { $gte: from, $lte: to } };
  if (ctx.locked) filter.$or = [{ from: ctx.branchId }, { to: ctx.branchId }];
  return Transfer.find(filter).sort({ createdAt: -1 }).limit(500).lean();
});

const Body = z.object({
  toBranch: z.string().regex(/^[a-f0-9]{24}$/i, "Choose the branch to send stock to"),
  items: z
    .array(z.object({ productId: z.string().regex(/^[a-f0-9]{24}$/i), qty: z.coerce.number().positive("Quantity must be more than zero") }))
    .min(1, "Add at least one item"),
  note: z.string().trim().optional(),
});

/** Sends stock from the current branch to another branch. */
export const POST = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId, branch } = ctx;
  const body = Body.parse(await req.json());
  if (body.toBranch === String(branchId)) throw new ApiError(400, "Choose a different branch to send stock to.");
  const target = ctx.branches.find((b) => String(b._id) === body.toBranch);
  if (!target) throw new ApiError(404, "Branch not found or closed.");
  if (new Set(body.items.map((i) => i.productId)).size !== body.items.length) throw new ApiError(400, "The same item is listed twice.");

  const products = await Product.find({ tenant: tid, _id: { $in: body.items.map((i) => i.productId) } }).select("name unit").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const here = await branchStock(tid, branchId, products.map((p) => p._id));
  const items = body.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new ApiError(400, "One of the items no longer exists. Please refresh.");
    const have = here.get(i.productId) ?? 0;
    if (have < i.qty) throw new ApiError(400, `Not enough ${p.name} in ${branch.name}: you have ${have}, trying to send ${i.qty}.`);
    return { product: p._id, name: p.name, unit: p.unit, qty: Math.round(i.qty * 1000) / 1000 };
  });

  const transferNo = await nextNumber(tid, "transfer", "TRF");
  const transfer = await Transfer.create({
    tenant: tid,
    transferNo,
    from: branchId,
    fromName: branch.name,
    to: target._id,
    toName: target.name,
    items,
    note: body.note,
    user: user.id,
    userName: user.name,
  });
  for (const i of items) {
    const out = await moveStock({ tid, branch: branchId, productId: i.product, qty: -i.qty, type: "transfer", refNo: transferNo, note: `To ${target.name}`, userId: user.id });
    // The same lots (with their expiry dates) arrive at the other branch.
    await moveStock({
      tid,
      branch: target._id,
      productId: i.product,
      qty: i.qty,
      type: "transfer",
      refNo: transferNo,
      note: `From ${branch.name}`,
      userId: user.id,
      batch: { incoming: out?.allocations.map((a) => ({ qty: a.qty, expiryDate: a.expiryDate, batchNo: a.batchNo })), source: { type: "transfer", refNo: transferNo } },
    });
  }
  await logActivity(
    { tid, user, branchId },
    { action: "stock.transfer", summary: `${transferNo}: ${items.map((i) => `${i.name} ×${i.qty}`).join(", ")} → ${target.name}`, refType: "transfer", refId: transfer._id, refNo: transferNo },
  );
  return transfer.toObject();
});
