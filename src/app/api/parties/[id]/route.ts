import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { LedgerEntry, Party, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const party = await Party.findOne({ _id: id, tenant: tid }).lean();
  if (!party) throw new ApiError(404, "Not found.");
  const entries = await LedgerEntry.find({ tenant: tid, party: id }).sort({ createdAt: -1 }).limit(500).lean();
  const users = await User.find({ tenant: tid }).select("name").lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const ledger = entries.map((e) => ({ ...e, user: e.user ? { name: names.get(String(e.user)) ?? "" } : null }));
  return { party, ledger };
});

const Body = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const party = await Party.findOneAndUpdate({ _id: id, tenant: tid }, Body.parse(await req.json()), { new: true }).lean();
  if (!party) throw new ApiError(404, "Not found.");
  return party;
});
