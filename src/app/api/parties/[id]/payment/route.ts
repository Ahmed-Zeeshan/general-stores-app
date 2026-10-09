import { z } from "zod";
import { ApiError, handle, requireUser } from "@/lib/api";
import { postLedger } from "@/lib/services";
import { Party } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** payment = money received from customer / paid to supplier. charge = add to what is owed. */
  type: z.enum(["payment", "charge"]),
  amount: z.coerce.number().positive("Amount must be more than zero"),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
  note: z.string().trim().optional(),
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const party = await Party.findById(id).lean();
  if (!party) throw new ApiError(404, "Not found.");
  if (party.type === "supplier" && user.role === "cashier") throw new ApiError(403, "Only owner or manager can pay suppliers.");
  if (body.type === "charge" && user.role === "cashier") throw new ApiError(403, "Only owner or manager can add manual udhaar.");

  const entry = await postLedger({
    partyId: id,
    kind: body.type === "payment" ? "payment" : "adjustment",
    amount: body.type === "payment" ? -body.amount : body.amount,
    method: body.type === "payment" ? body.method : undefined,
    note: body.note,
    userId: user.id,
  });
  return entry;
});
