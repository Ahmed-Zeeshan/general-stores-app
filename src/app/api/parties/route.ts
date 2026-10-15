import { z } from "zod";
import { ApiError, escapeRegex, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { postLedger } from "@/lib/services";
import { Party } from "@/models";

export const GET = handle(async (req) => {
  const { tid } = await requireTenant();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "supplier" ? "supplier" : "customer";
  const q = url.searchParams.get("q")?.trim();
  const query: Record<string, unknown> = { tenant: tid, type, active: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ name: rx }, { phone: rx }];
  }
  if (url.searchParams.get("due") === "1") query.balance = { $gt: 0 };
  return Party.find(query).sort({ balance: -1, name: 1 }).limit(2000).lean();
});

const Body = z.object({
  type: z.enum(["customer", "supplier"]),
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  creditLimit: z.coerce.number().min(0).max(100_000_000).optional(),
  priceLevel: z.enum(["retail", "wholesale"]).optional(),
  notes: z.string().trim().max(1000).optional(),
  openingBalance: z.coerce.number().min(-100_000_000).max(100_000_000).optional(),
});

export const POST = handle(async (req) => {
  const { user, tid } = await requireTenant();
  const { openingBalance, ...body } = Body.parse(await req.json());
  if (body.type === "supplier" && user.role === "cashier") {
    throw new ApiError(403, "Only owner or manager can add suppliers.");
  }
  // Old udhaar, udhaar limits and wholesale prices change what a customer owes or pays: owner / manager only.
  if (user.role === "cashier" && (openingBalance || (body.creditLimit ?? 0) > 0 || body.priceLevel === "wholesale")) {
    throw new ApiError(403, "Only the owner or manager can enter old udhaar, an udhaar limit or wholesale prices. Add the customer with name and phone.");
  }
  const party = await Party.create({ ...body, tenant: tid, balance: 0 });
  if (openingBalance) {
    await postLedger({ tid, partyId: party._id, kind: "opening", amount: openingBalance, note: "Opening balance", userId: user.id });
    await logActivity({ tid, user }, { action: "khata.opening", summary: `New ${body.type} ${body.name} with old balance Rs ${openingBalance}`, refType: "party", refId: party._id, amount: openingBalance });
  }
  return Party.findOne({ _id: party._id, tenant: tid }).lean();
});
