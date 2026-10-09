import { z } from "zod";
import { ApiError, escapeRegex, handle, requireUser } from "@/lib/api";
import { postLedger } from "@/lib/services";
import { Party } from "@/models";

export const GET = handle(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "supplier" ? "supplier" : "customer";
  const q = url.searchParams.get("q")?.trim();
  const query: Record<string, unknown> = { type, active: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ name: rx }, { phone: rx }];
  }
  if (url.searchParams.get("due") === "1") query.balance = { $gt: 0 };
  return Party.find(query).sort({ balance: -1, name: 1 }).limit(1000).lean();
});

const Body = z.object({
  type: z.enum(["customer", "supplier"]),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
  openingBalance: z.coerce.number().optional(),
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { openingBalance, ...body } = Body.parse(await req.json());
  if (body.type === "supplier" && user.role === "cashier") {
    throw new ApiError(403, "Only owner or manager can add suppliers.");
  }
  const party = await Party.create({ ...body, balance: 0 });
  if (openingBalance) {
    await postLedger({ partyId: party._id, kind: "opening", amount: openingBalance, note: "Opening balance", userId: user.id });
  }
  return Party.findById(party._id).lean();
});
