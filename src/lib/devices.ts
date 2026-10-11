import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import { ApiError } from "./api";
import { Device } from "@/models";
import { cleanImei } from "./imei";

type Id = string | Types.ObjectId;

export { cleanImei, imeiCheckOk } from "./imei";

export type DeviceUnit = {
  imei: string;
  imei2?: string;
  color?: string;
  storage?: string;
  condition?: "new" | "used" | "refurbished";
  pta?: "approved" | "non_pta" | "unknown";
  /** Cost of this piece; default = the cost given for the line. */
  cost?: number;
  price?: number;
  notes?: string;
};

/** Checks a list of new pieces: valid serials, no repeats, none already in stock. */
export async function checkNewUnits(tid: Types.ObjectId, units: DeviceUnit[]) {
  const all: string[] = [];
  for (const u of units) {
    u.imei = cleanImei(u.imei ?? "");
    if (u.imei2) u.imei2 = cleanImei(u.imei2);
    if (!/^[A-Z0-9]{4,30}$/.test(u.imei)) throw new ApiError(400, `"${u.imei || "(empty)"}" is not a valid IMEI / serial number.`);
    if (u.imei2 && !/^[A-Z0-9]{4,30}$/.test(u.imei2)) throw new ApiError(400, `"${u.imei2}" is not a valid second IMEI.`);
    all.push(u.imei, ...(u.imei2 ? [u.imei2] : []));
  }
  const seen = new Set<string>();
  for (const x of all) {
    if (seen.has(x)) throw new ApiError(400, `IMEI ${x} is entered twice.`);
    seen.add(x);
  }
  const taken = await Device.findOne({ tenant: tid, status: "in_stock", $or: [{ imei: { $in: all } }, { imei2: { $in: all } }] }).lean();
  if (taken) throw new ApiError(409, `IMEI ${all.find((x) => x === taken.imei || x === taken.imei2)} is already in stock (${taken.productName}).`);
}

/** Creates the pieces (status in stock). Call `moveStock` with `serialOk` for the same quantity. */
export async function addDevices(opts: {
  tid: Types.ObjectId;
  branch: Types.ObjectId;
  product: { _id: Types.ObjectId; name: string };
  units: DeviceUnit[];
  cost: number;
  source: { type: string; id?: Id; refNo?: string; name?: string };
  event: { action: string; refNo?: string; note?: string };
  userName: string;
}) {
  await checkNewUnits(opts.tid, opts.units);
  try {
    return await Device.insertMany(
      opts.units.map((u) => ({
        tenant: opts.tid,
        product: opts.product._id,
        productName: opts.product.name,
        branch: opts.branch,
        imei: u.imei,
        imei2: u.imei2 || undefined,
        color: u.color || undefined,
        storage: u.storage || undefined,
        condition: u.condition ?? "new",
        pta: u.pta ?? "unknown",
        cost: Math.round((u.cost ?? opts.cost) * 100) / 100,
        price: u.price || undefined,
        notes: u.notes || undefined,
        source: opts.source,
        history: [{ ...opts.event, userName: opts.userName }],
      })),
      { ordered: true },
    );
  } catch (err) {
    // Someone added the same IMEI at the same moment.
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, "One of these IMEIs was just added by someone else. Please refresh and check.");
    throw err;
  }
}

/**
 * Takes in-stock pieces of a product at a branch (to sell, return to the supplier or remove).
 * All or nothing: if any piece is no longer in stock (sold at another counter just now),
 * nothing is changed. Returns the pieces as they were before.
 */
export async function claimDevices(opts: {
  tid: Types.ObjectId;
  ids: Id[];
  productId: Id;
  branch: Types.ObjectId;
  /** Only pieces that came from this purchase (returns to the supplier). */
  sourceId?: Id;
  to: "sold" | "returned" | "removed";
  sale?: { id?: Id; invoiceNo: string; customerName?: string | null; at: Date; prices: Map<string, number>; warrantyMonths?: number | null };
  event: { action: string; refNo?: string; note?: string };
  userName: string;
}) {
  const ids = opts.ids.map(String);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "The same phone is listed twice.");
  const found = await Device.find({ tenant: opts.tid, _id: { $in: ids } }).lean();
  for (const id of ids) {
    const d = found.find((x) => String(x._id) === id);
    if (!d) throw new ApiError(400, "One of the phones was not found. Please refresh.");
    if (String(d.product) !== String(opts.productId)) throw new ApiError(400, `IMEI ${d.imei} is a ${d.productName}, not this item.`);
    if (d.status !== "in_stock") throw new ApiError(400, `IMEI ${d.imei} is not in stock (${d.status === "sold" ? `sold on ${d.sale?.invoiceNo ?? "another bill"}` : d.status}).`);
    if (String(d.branch) !== String(opts.branch)) throw new ApiError(400, `IMEI ${d.imei} is at another branch.`);
    if (opts.sourceId && String(d.source?.id) !== String(opts.sourceId)) throw new ApiError(400, `IMEI ${d.imei} did not come from this purchase.`);
  }
  const op = randomUUID();
  const event = { ...opts.event, userName: opts.userName, at: new Date(), op };
  let changed = 0;
  for (const d of found) {
    const until = opts.sale?.warrantyMonths ? addMonths(opts.sale.at, opts.sale.warrantyMonths) : undefined;
    const set: Record<string, unknown> = { status: opts.to };
    if (opts.sale) {
      set.sale = {
        id: opts.sale.id,
        invoiceNo: opts.sale.invoiceNo,
        customerName: opts.sale.customerName ?? undefined,
        at: opts.sale.at,
        price: opts.sale.prices.get(String(d._id)),
        warrantyUntil: until,
      };
    }
    const r = await Device.updateOne(
      { _id: d._id, tenant: opts.tid, status: "in_stock", branch: opts.branch },
      { $set: set, $push: { history: event } },
    );
    changed += r.modifiedCount;
  }
  if (changed !== found.length) {
    await undoClaim(opts.tid, op);
    throw new ApiError(409, "One of these phones was just sold or moved at another counter. Please refresh and try again.");
  }
  return { devices: found, op };
}

/** Puts back pieces taken by `claimDevices` (when saving the bill / return fails). */
export async function undoClaim(tid: Types.ObjectId, op: string) {
  await Device.updateMany(
    { tenant: tid, "history.op": op },
    { $set: { status: "in_stock" }, $unset: { sale: 1 }, $pull: { history: { op } } },
  );
}

/** Links pieces just sold to the saved bill. */
export async function linkSale(tid: Types.ObjectId, op: string, saleId: Types.ObjectId) {
  await Device.updateMany({ tenant: tid, "history.op": op }, { $set: { "sale.id": saleId } });
}

/** Sold pieces come back (customer return): in stock again at `branch`. */
export async function restoreDevices(opts: {
  tid: Types.ObjectId;
  ids: Id[];
  branch: Types.ObjectId;
  event: { action: string; refNo?: string; note?: string };
  userName: string;
  from?: "sold";
}) {
  const event = { ...opts.event, userName: opts.userName, at: new Date() };
  for (const id of opts.ids) {
    try {
      const r = await Device.updateOne(
        { _id: id, tenant: opts.tid, status: opts.from ?? "sold" },
        { $set: { status: "in_stock", branch: opts.branch }, $unset: { sale: 1 }, $push: { history: event } },
      );
      if (!r.modifiedCount) throw new ApiError(409, "One of the returned phones is not marked as sold any more. Please refresh.");
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const d = await Device.findOne({ _id: id, tenant: opts.tid }).lean();
        throw new ApiError(409, `IMEI ${d?.imei} is already back in stock (bought again). It cannot be returned twice.`);
      }
      throw err;
    }
  }
}

/** Moves in-stock pieces to another branch. */
export async function moveDevices(opts: { tid: Types.ObjectId; ids: Id[]; productId: Id; from: Types.ObjectId; to: Types.ObjectId; event: { action: string; refNo?: string; note?: string }; userName: string }) {
  const { devices, op } = await claimDevices({ tid: opts.tid, ids: opts.ids, productId: opts.productId, branch: opts.from, to: "removed", event: opts.event, userName: opts.userName });
  // Claimed (so no one can sell them meanwhile); now place them at the other branch.
  await Device.updateMany({ tenant: opts.tid, "history.op": op }, { $set: { status: "in_stock", branch: opts.to } });
  return devices;
}

export function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}
