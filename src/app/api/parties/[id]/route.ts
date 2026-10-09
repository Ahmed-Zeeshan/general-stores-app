import { z } from "zod";
import { ApiError, handle, requireUser } from "@/lib/api";
import { LedgerEntry, Party } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireUser();
  const { id } = await params;
  const party = await Party.findById(id).lean();
  if (!party) throw new ApiError(404, "Not found.");
  const ledger = await LedgerEntry.find({ party: id }).sort({ createdAt: -1 }).limit(300).populate("user", "name").lean();
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
  await requireUser(["owner", "manager"]);
  const { id } = await params;
  const party = await Party.findByIdAndUpdate(id, Body.parse(await req.json()), { new: true }).lean();
  if (!party) throw new ApiError(404, "Not found.");
  return party;
});
