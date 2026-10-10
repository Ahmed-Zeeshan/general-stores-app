import { handle, requireTenant } from "@/lib/api";
import { syncSaleToFbr } from "@/lib/fbr";
import { Sale } from "@/models";

/** Re-sends bills that could not reach FBR earlier (e.g. internet was down). */
export const POST = handle(async () => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const pending = await Sale.find({ tenant: tid, fbrStatus: "pending" }).sort({ createdAt: 1 }).limit(200).lean();
  let synced = 0;
  for (const sale of pending) {
    let ok: string | null;
    if (!sale.fbrInvoiceNumber) {
      ok = await syncSaleToFbr(tid, sale._id, "sale");
      // A bill returned before it ever reached FBR also needs its credit note.
      if (ok && sale.status === "returned") {
        await Sale.updateOne({ _id: sale._id, tenant: tid }, { fbrStatus: "pending" });
        ok = await syncSaleToFbr(tid, sale._id, "return");
      }
    } else {
      ok = await syncSaleToFbr(tid, sale._id, "return");
    }
    if (ok) synced++;
  }
  const remaining = await Sale.countDocuments({ tenant: tid, fbrStatus: "pending" });
  return { tried: pending.length, synced, remaining };
});
