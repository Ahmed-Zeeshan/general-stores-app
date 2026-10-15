import type { Types } from "mongoose";
import { headers } from "next/headers";
import { ActivityLog } from "@/models";
import { clientIp } from "./rate-limit";

type Who = { tid: Types.ObjectId; user: { id: string; name: string; role: string }; branchId?: Types.ObjectId | null };

export type ActivityEntry = {
  action: string;
  summary: string;
  refType?: string;
  refId?: Types.ObjectId | string | null;
  refNo?: string | null;
  amount?: number | null;
  meta?: Record<string, unknown>;
};

/** Records a sensitive action. Never fails the request it belongs to. */
export async function logActivity(who: Who, entry: ActivityEntry) {
  try {
    let ip: string | undefined;
    try {
      const h = await headers();
      ip = clientIp(h);
    } catch {
      /* outside a request */
    }
    await ActivityLog.create({
      tenant: who.tid,
      user: who.user.id,
      userName: who.user.name,
      role: who.user.role,
      branch: who.branchId ?? undefined,
      action: entry.action,
      summary: entry.summary,
      refType: entry.refType,
      refId: entry.refId ?? undefined,
      refNo: entry.refNo ?? undefined,
      amount: entry.amount ?? undefined,
      meta: entry.meta,
      ip,
    });
  } catch (err) {
    console.error("activity log failed", err);
  }
}
