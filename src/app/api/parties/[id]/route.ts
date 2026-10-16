import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { checkPartyPhone } from "@/lib/phone";
import { LedgerEntry, Party, PointsEntry, User } from "@/models";

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
  const points = party.type === "customer" ? await PointsEntry.find({ tenant: tid, party: id }).sort({ createdAt: -1 }).limit(100).lean() : [];
  return { party, ledger, points };
});

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  creditLimit: z.coerce.number().min(0).max(100_000_000).optional(),
  priceLevel: z.enum(["retail", "wholesale"]).optional(),
  notes: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const before = await Party.findOne({ _id: id, tenant: tid }).select("type creditLimit priceLevel").lean();
  if (!before) throw new ApiError(404, "Not found.");
  const update: Record<string, unknown> = { ...body };
  if (body.phone !== undefined) {
    const phone = checkPartyPhone(before.type as "customer" | "supplier", body.phone);
    if (phone.error) throw new ApiError(400, phone.error);
    update.phone = phone.phone ?? "";
  }
  const party = await Party.findOneAndUpdate({ _id: id, tenant: tid }, update, { new: true }).lean();
  if (!party) throw new ApiError(404, "Not found.");
  const changes = [
    body.creditLimit !== undefined && body.creditLimit !== (before?.creditLimit ?? 0) && `udhaar limit ${before?.creditLimit ?? 0} → ${body.creditLimit}`,
    body.priceLevel && body.priceLevel !== (before?.priceLevel ?? "retail") && `prices ${before?.priceLevel ?? "retail"} → ${body.priceLevel}`,
  ].filter(Boolean);
  if (changes.length) await logActivity({ tid, user }, { action: "party.update", summary: `${party.name}: ${changes.join(", ")}`, refType: "party", refId: party._id });
  return party;
});
