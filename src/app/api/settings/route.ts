import { z } from "zod";
import { SHOP_TYPES } from "@/lib/constants";
import { handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Sale, SaleReturn, Tenant } from "@/models";

export const GET = handle(async () => {
  const { tid } = await requireTenant();
  const [tenant, withToken, fbrPending] = await Promise.all([
    Tenant.findById(tid).select("-adminNotes").lean(),
    Tenant.findById(tid).select("+fbrToken").lean(),
    Sale.countDocuments({ tenant: tid, fbrStatus: "pending" }),
  ]);
  const pendingReturns = await SaleReturn.countDocuments({ tenant: tid, fbrStatus: "pending" });
  // Never send the FBR token back to the browser; just say whether one is saved.
  return { ...tenant, fbrTokenSet: !!withToken?.fbrToken, fbrPending: fbrPending + pendingReturns };
});

const Body = z.object({
  shopName: z.string().trim().min(2),
  shopType: z.enum(SHOP_TYPES),
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
  waTemplate: z.string().trim().max(1000).optional(),
  waPaymentTemplate: z.string().trim().max(1000).optional(),
  loyaltyEnabled: z.boolean().optional(),
  requireOpenDrawer: z.boolean().optional(),
  drawerVariance: z.coerce.number().min(0).max(1_000_000).optional(),
  loyaltyEarnPer: z.coerce.number().min(1).max(1_000_000).optional(),
  loyaltyPointValue: z.coerce.number().min(0).max(100_000).optional(),
  loyaltyMinRedeem: z.coerce.number().int().min(0).max(1_000_000).optional(),
  ownerPhone: z.string().trim().max(20).optional(),
  publicUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v) || /^https?:\/\/localhost(:\d+)?\/?$/i.test(v), "The app's address must start with https:// (e.g. https://myshop.example.com)")
    .optional(),
  modules: z.object({ phones: z.boolean(), repairs: z.boolean(), wallets: z.boolean(), installments: z.boolean() }).partial().optional(),
});

const SETTING_LABELS: Record<string, string> = {
  shopName: "shop name",
  shopType: "shop type",
  ownerName: "owner name",
  phone: "phone",
  address: "address",
  ntn: "NTN",
  strn: "STRN",
  taxEnabled: "sales tax on/off",
  taxRate: "tax rate",
  pricesIncludeTax: "prices include tax",
  receiptFooter: "receipt footer",
  fbrEnabled: "FBR on/off",
  fbrMode: "FBR mode",
  fbrPosId: "FBR POS ID",
  fbrDefaultPct: "FBR PCT code",
  fbrToken: "FBR token",
  waTemplate: "WhatsApp reminder message",
  waPaymentTemplate: "WhatsApp payment message",
  loyaltyEnabled: "loyalty points on/off",
  requireOpenDrawer: "bills only with an open cash drawer",
  drawerVariance: "allowed drawer difference before a reason is needed",
  loyaltyEarnPer: "points earning rate",
  loyaltyPointValue: "point value",
  loyaltyMinRedeem: "minimum points to spend",
  modules: "features",
  publicUrl: "app address for customer links",
  ownerPhone: "owner's WhatsApp number",
};

export const PUT = handle(async (req) => {
  const { tid, user } = await requireTenant(["owner"]);
  const { fbrToken, ...body } = Body.parse(await req.json());
  const before = (await Tenant.findById(tid).lean()) as Record<string, unknown> | null;
  const update: Record<string, unknown> = { ...body };
  // Switching one feature keeps the others as they are.
  if (body.modules) update.modules = { ...((before?.modules as object) ?? {}), ...body.modules };
  // Secret: an empty field means "keep the saved one".
  if (fbrToken) update.fbrToken = fbrToken;
  const saved = await Tenant.findByIdAndUpdate(tid, update, { new: true }).select("-adminNotes").lean();
  const changed = Object.keys(update).filter((k) => k === "fbrToken" || JSON.stringify(before?.[k] ?? null) !== JSON.stringify(update[k] ?? null));
  if (changed.length) {
    await logActivity(
      { tid, user },
      { action: "settings.update", summary: `Changed shop settings: ${changed.map((k) => SETTING_LABELS[k] ?? k).join(", ")}`, meta: { changed: Object.fromEntries(changed.filter((k) => k !== "fbrToken").map((k) => [k, { from: before?.[k] ?? null, to: update[k] }])) } },
    );
  }
  return saved;
});
