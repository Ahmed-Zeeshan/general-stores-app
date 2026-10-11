import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { loadPlan, withState } from "@/lib/installments";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireBranch();
  const { id } = await params;
  return withState(await loadPlan(tid, id));
});
