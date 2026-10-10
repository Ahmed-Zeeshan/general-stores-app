import { z } from "zod";
import { handle, requireTenant } from "@/lib/api";
import { Sale, Tenant } from "@/models";

export const GET = handle(async () => {
  const { tid } = await requireTenant();
  const [tenant, withToken, fbrPending] = await Promise.all([
    Tenant.findById(tid).select("-adminNotes").lean(),
    Tenant.findById(tid).select("+fbrToken").lean(),
    Sale.countDocuments({ tenant: tid, fbrStatus: "pending" }),
  ]);
  // Never send the FBR token back to the browser; just say whether one is saved.
  return { ...tenant, fbrTokenSet: !!withToken?.fbrToken, fbrPending };
});

const Body = z.object({
  shopName: z.string().trim().min(2),
  shopType: z.enum(["karyana", "general", "bakery", "other"]),
  ownerName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  ntn: z.string().trim().optional(),
  strn: z.string().trim().optional(),
  taxEnabled: z.boolean(),
  taxRate: z.coerce.number().min(0).max(100),
  pricesIncludeTax: z.boolean(),
  receiptFooter: z.string().trim().max(200).optional(),
  fbrEnabled: z.boolean().optional(),
  fbrMode: z.enum(["sandbox", "live"]).optional(),
  fbrPosId: z.string().trim().regex(/^\d*$/, "POS ID must be a number").optional(),
  fbrDefaultPct: z.string().trim().optional(),
  /** Empty = keep the saved token. */
  fbrToken: z.string().trim().optional(),
});

export const PUT = handle(async (req) => {
  const { tid } = await requireTenant(["owner"]);
  const { fbrToken, ...body } = Body.parse(await req.json());
  const update: Record<string, unknown> = { ...body };
  if (fbrToken) update.fbrToken = fbrToken;
  return Tenant.findByIdAndUpdate(tid, update, { new: true }).select("-adminNotes").lean();
});
