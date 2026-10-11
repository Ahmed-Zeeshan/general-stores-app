import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { assertOpen, loadRepair, repairTotals, saveRepair } from "@/lib/repairs";
import { moveStock } from "@/lib/services";

type Ctx = { params: Promise<{ id: string; partId: string }> };

/** Takes a part off the job and puts it back in stock (not used after all). */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { user, tid } = await requireBranch();
  const { id, partId } = await params;
  const r = await loadRepair(tid, id);
  assertOpen(r);
  const part = r.parts.find((p) => String((p as { _id?: unknown })._id) === partId);
  if (!part) throw new ApiError(404, "Part not found on this job.");
  const saved = await saveRepair(tid, r, { $pull: { parts: { _id: (part as { _id: unknown })._id } } }, { note: `Part removed: ${part.name} ×${part.qty} (back to stock)`, userName: user.name });
  await moveStock({ tid, branch: r.branch, productId: part.product, qty: part.qty, type: "repair", refNo: r.jobNo, note: `Not used in repair ${r.jobNo}`, userId: user.id });
  return { ...saved, ...repairTotals(saved) };
});
