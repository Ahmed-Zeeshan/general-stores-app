import { ApiError, handle, requireTenant } from "@/lib/api";
import { round2 } from "@/lib/money";
import { withState, type PlanLean } from "@/lib/installments";
import { InstallmentPlan, Party, Repair, Sale, SaleReturn, Tenant, UsedPurchase } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Everything about one customer on one page: what they bought (bills, phones and their warranty),
 * repairs, installment plans and phones bought from them.
 */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid, user } = await requireTenant();
  const { id } = await params;
  const party = await Party.findOne({ _id: id, tenant: tid, type: "customer" }).select("name phone").lean();
  if (!party) throw new ApiError(404, "Customer not found.");
  const tenant = (await Tenant.findById(tid).select("modules").lean()) as { modules?: Record<string, boolean> } | null;
  const m = tenant?.modules ?? {};
  const manage = user.role === "owner" || user.role === "manager";

  const [totals, sales, returns, repairs, plans, used] = await Promise.all([
    Sale.aggregate([
      { $match: { tenant: tid, customer: party._id } },
      { $group: { _id: null, bills: { $sum: 1 }, total: { $sum: "$total" }, first: { $min: "$createdAt" }, last: { $max: "$createdAt" } } },
    ]),
    Sale.find({ tenant: tid, customer: party._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("invoiceNo total status paymentMethod payments creditAmount createdAt branchName installment items.name items.qty items.unit items.serials items.warrantyUntil items.returnedQty")
      .lean(),
    SaleReturn.aggregate([{ $match: { tenant: tid, customer: party._id } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
    m.repairs ? Repair.find({ tenant: tid, customer: party._id }).sort({ createdAt: -1 }).limit(50).select("jobNo deviceName problem status total paid creditAmount createdAt deliveredAt warrantyUntil").lean() : [],
    m.installments ? InstallmentPlan.find({ tenant: tid, customer: party._id }).sort({ createdAt: -1 }).select("-payments").lean() : [],
    m.phones && manage ? UsedPurchase.find({ tenant: tid, "seller.party": party._id }).sort({ createdAt: -1 }).select("buyNo productName imei price status createdAt").lean() : [],
  ]);

  // Phones bought here (IMEI) with their warranty, newest first.
  const now = Date.now();
  const phones = sales.flatMap((s) =>
    (s.items ?? []).flatMap((i) =>
      (i.serials ?? []).map((d) => ({
        imei: d.imei,
        name: i.name,
        saleId: String(s._id),
        invoiceNo: s.invoiceNo,
        soldAt: s.createdAt,
        returned: !!d.returned,
        warrantyUntil: i.warrantyUntil ?? null,
        inWarranty: !d.returned && !!i.warrantyUntil && new Date(i.warrantyUntil).getTime() >= now,
      })),
    ),
  );

  const t = totals[0] ?? { bills: 0, total: 0, first: null, last: null };
  const returned = returns[0]?.total ?? 0;
  const planStates = (plans as unknown as PlanLean[]).map((p) => {
    const s = withState(p);
    return { _id: String(p._id), planNo: p.planNo, itemsText: p.itemsText, status: p.status, financed: p.financed, paid: p.paid, balance: s.balance, overdue: s.overdue, lateCount: s.lateCount, next: s.next, createdAt: p.createdAt };
  });
  return {
    stats: {
      bills: t.bills,
      bought: round2(t.total - returned),
      avgBill: t.bills ? round2(t.total / t.bills) : 0,
      firstVisit: t.first,
      lastVisit: t.last,
      phones: phones.filter((p) => !p.returned).length,
      inWarranty: phones.filter((p) => p.inWarranty).length,
      openRepairs: repairs.filter((r) => !["delivered", "cancelled"].includes(r.status)).length,
      installmentsLeft: round2(planStates.filter((p) => p.status === "active").reduce((a, p) => a + p.balance, 0)),
      installmentsLate: round2(planStates.filter((p) => p.status === "active").reduce((a, p) => a + p.overdue, 0)),
    },
    bills: sales.map((s) => ({
      _id: String(s._id),
      invoiceNo: s.invoiceNo,
      total: s.total,
      status: s.status,
      method: s.installment ? "installments" : (s.payments?.length ?? 0) > 1 ? "split" : s.paymentMethod,
      creditAmount: s.creditAmount ?? 0,
      createdAt: s.createdAt,
      branchName: s.branchName,
      items: (s.items ?? []).map((i) => `${i.name}${i.qty !== 1 ? ` ×${i.qty}` : ""}`).join(", "),
    })),
    phones,
    repairs: repairs.map((r) => ({ ...r, _id: String(r._id), balance: round2(Math.max(0, (r.total ?? 0) - (r.paid ?? 0) - (r.creditAmount ?? 0))) })),
    installments: planStates,
    usedPhones: used,
    modules: m,
  };
});
