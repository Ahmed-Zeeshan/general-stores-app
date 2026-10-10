import { z } from "zod";
import { ApiError, dateRange, handle, requireTenant } from "@/lib/api";
import { Party, Reminder } from "@/models";

export const GET = handle(async (req) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { from, to } = dateRange(new URL(req.url), 29);
  return Reminder.find({ tenant: tid, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).limit(500).lean();
});

const Body = z.object({
  partyId: z.string().regex(/^[a-f0-9]{24}$/i),
  kind: z.enum(["reminder", "statement"]).default("reminder"),
});

/** Records that a WhatsApp reminder/statement was opened for a customer. */
export const POST = handle(async (req) => {
  const { user, tid } = await requireTenant();
  const body = Body.parse(await req.json());
  const party = await Party.findOne({ _id: body.partyId, tenant: tid }).select("name phone balance").lean();
  if (!party) throw new ApiError(404, "Customer not found.");
  return Reminder.create({
    tenant: tid,
    party: party._id,
    partyName: party.name,
    phone: party.phone,
    amount: party.balance,
    kind: body.kind,
    user: user.id,
    userName: user.name,
  });
});
