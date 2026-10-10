import type { Types } from "mongoose";
import { Party, PointsEntry } from "@/models";

type Id = string | Types.ObjectId;

/**
 * Writes the points history for a bill. The points spent were already taken from the customer
 * (atomically, before the bill was saved); earned points are added here.
 */
export async function recordPoints(tid: Types.ObjectId, partyId: Id, o: { redeemed: number; earned: number; saleId: Id; invoiceNo: string; userId: Id }) {
  let balance = (await Party.findOne({ _id: partyId, tenant: tid }).select("points").lean())?.points ?? 0;
  if (o.redeemed > 0) {
    await PointsEntry.create({ tenant: tid, party: partyId, kind: "redeem", points: -o.redeemed, balanceAfter: balance, refType: "sale", refId: o.saleId, refNo: o.invoiceNo, user: o.userId });
  }
  if (o.earned > 0) {
    const p = await Party.findOneAndUpdate({ _id: partyId, tenant: tid }, { $inc: { points: o.earned } }, { new: true }).select("points").lean();
    balance = p?.points ?? balance + o.earned;
    await PointsEntry.create({ tenant: tid, party: partyId, kind: "earn", points: o.earned, balanceAfter: balance, refType: "sale", refId: o.saleId, refNo: o.invoiceNo, user: o.userId });
  }
}

/** Takes back points earned on goods that were returned. */
export async function reversePoints(tid: Types.ObjectId, partyId: Id, o: { points: number; returnId: Id; returnNo: string; userId: Id }) {
  if (o.points <= 0) return;
  const p = await Party.findOneAndUpdate({ _id: partyId, tenant: tid }, { $inc: { points: -o.points } }, { new: true }).select("points").lean();
  await PointsEntry.create({ tenant: tid, party: partyId, kind: "return", points: -o.points, balanceAfter: p?.points ?? 0, refType: "return", refId: o.returnId, refNo: o.returnNo, user: o.userId });
}
