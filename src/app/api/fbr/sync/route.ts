import { handle, requireTenant } from "@/lib/api";
import { syncReturnToFbr, syncSaleToFbr } from "@/lib/fbr";
import { Sale, SaleReturn } from "@/models";

/** Re-sends bills and returns that could not reach FBR earlier (e.g. internet was down). */
export const POST = handle(async () => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const pendingSales = await Sale.find({ tenant: tid, fbrStatus: "pending" }).sort({ createdAt: 1 }).limit(200).lean();
  let synced = 0;
  for (const sale of pendingSales) if (await syncSaleToFbr(tid, sale._id)) synced++;
  // Returns go after their bills, because a credit note must refer to the bill's FBR number.
  const pendingReturns = await SaleReturn.find({ tenant: tid, fbrStatus: "pending" }).sort({ createdAt: 1 }).limit(200).lean();
  for (const r of pendingReturns) if (await syncReturnToFbr(tid, r._id)) synced++;
  const remaining =
    (await Sale.countDocuments({ tenant: tid, fbrStatus: "pending" })) + (await SaleReturn.countDocuments({ tenant: tid, fbrStatus: "pending" }));
  return { tried: pendingSales.length + pendingReturns.length, synced, remaining };
});
