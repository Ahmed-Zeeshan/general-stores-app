import { z } from "zod";
import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { assertOpen, loadRepair, repairTotals, saveRepair } from "@/lib/repairs";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ status: z.enum(["received", "checking", "waiting_parts", "repairing", "ready"]), note: z.string().trim().max(300).optional() });

/** Moves the job to another step (delivery and cancelling have their own actions). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid } = await requireBranch();
  const { id } = await params;
  const { status, note } = Body.parse(await req.json());
  const r = await loadRepair(tid, id);
  assertOpen(r);
  if (r.status === status && !note) return { ...r, ...repairTotals(r) };
  const saved = await saveRepair(tid, r, { $set: { status, ...(status === "ready" ? { readyAt: new Date() } : {}) } }, { status, note, userName: user.name });
  return { ...saved, ...repairTotals(saved) };
});
