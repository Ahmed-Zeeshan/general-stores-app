import type { Types } from "mongoose";
import { Purchase, PurchaseReturn, Repair, Sale, SaleReturn, UsedPurchase } from "@/models";

type Movement = { type: string; refNo?: string | null };

/**
 * Adds the record each stock movement came from (refType + refId), found by its number, so a stock
 * history row opens its bill, return, purchase, repair… Works for old movements too.
 */
export async function linkMovements<M extends Movement>(tid: Types.ObjectId, movements: M[]): Promise<(M & { refType?: string; refId?: string })[]> {
  const nos = (...types: string[]) => [...new Set(movements.filter((m) => types.includes(m.type) && m.refNo).map((m) => m.refNo!))];
  const [sales, returns, purchases, purchaseReturns, used, repairs] = await Promise.all([
    Sale.find({ tenant: tid, invoiceNo: { $in: nos("sale") } }).select("invoiceNo").lean(),
    SaleReturn.find({ tenant: tid, returnNo: { $in: nos("return") } }).select("returnNo").lean(),
    Purchase.find({ tenant: tid, purchaseNo: { $in: nos("purchase", "void") } }).select("purchaseNo").lean(),
    PurchaseReturn.find({ tenant: tid, returnNo: { $in: nos("purchase_return") } }).select("returnNo purchase").lean(),
    UsedPurchase.find({ tenant: tid, buyNo: { $in: nos("used_buy", "void") } }).select("buyNo").lean(),
    Repair.find({ tenant: tid, jobNo: { $in: nos("repair") } }).select("jobNo").lean(),
  ]);
  const by = <T>(list: T[], key: (x: T) => string, ref: (x: T) => { refType: string; refId: string }) => new Map(list.map((x) => [key(x), ref(x)]));
  const maps: Record<string, Map<string, { refType: string; refId: string }>> = {
    sale: by(sales, (x) => x.invoiceNo, (x) => ({ refType: "sale", refId: String(x._id) })),
    return: by(returns, (x) => x.returnNo, (x) => ({ refType: "return", refId: String(x._id) })),
    purchase: by(purchases, (x) => x.purchaseNo, (x) => ({ refType: "purchase", refId: String(x._id) })),
    // A return to the supplier opens its purchase.
    purchase_return: by(purchaseReturns, (x) => x.returnNo, (x) => ({ refType: "purchase", refId: String(x.purchase) })),
    used_buy: by(used, (x) => x.buyNo, (x) => ({ refType: "used_buy", refId: String(x._id) })),
    repair: by(repairs, (x) => x.jobNo, (x) => ({ refType: "repair", refId: String(x._id) })),
  };
  return movements.map((m) => {
    if (!m.refNo) return m;
    const found =
      m.type === "void" ? (maps.purchase.get(m.refNo) ?? maps.used_buy.get(m.refNo)) : m.type === "transfer" || m.type === "production" ? { refType: m.type, refId: undefined } : maps[m.type]?.get(m.refNo);
    return found ? { ...m, ...found } : m;
  });
}
