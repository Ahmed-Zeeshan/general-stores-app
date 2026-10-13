import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { shareUrl } from "@/lib/share";
import { InstallmentPlan, Party, Repair, Sale, Tenant } from "@/models";

const Q = z.object({ kind: z.enum(["sale", "repair", "installment"]), id: z.string().regex(/^[a-f0-9]{24}$/i) });

/** The customer link for a bill / repair / installment plan (null when the shop has no public address) and the customer's mobile. */
export const GET = handle(async (req) => {
  const { tid } = await requireTenant();
  const { kind, id } = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const doc =
    kind === "sale"
      ? await Sale.findOne({ _id: id, tenant: tid }).select("customer").lean()
      : kind === "repair"
        ? await Repair.findOne({ _id: id, tenant: tid }).select("customer customerPhone").lean()
        : await InstallmentPlan.findOne({ _id: id, tenant: tid }).select("customer customerPhone").lean();
  if (!doc) throw new ApiError(404, "Not found.");
  const d = doc as { customer?: unknown; customerPhone?: string };
  let phone = d.customerPhone ?? null;
  if (!phone && d.customer) phone = (await Party.findOne({ _id: d.customer, tenant: tid }).select("phone").lean())?.phone ?? null;
  const tenant = (await Tenant.findById(tid).select("publicUrl").lean()) as { publicUrl?: string } | null;
  return { url: shareUrl(tenant?.publicUrl, kind, tid, id), phone };
});
