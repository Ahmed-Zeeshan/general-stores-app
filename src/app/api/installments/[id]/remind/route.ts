import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { InstallmentPlan } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** Notes that a WhatsApp reminder was sent today. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireBranch();
  const { id } = await params;
  await InstallmentPlan.updateOne({ _id: id, tenant: tid }, { $set: { lastReminderAt: new Date() } });
  return { ok: true };
});
