import { z } from "zod";
import { ApiError, escapeRegex, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { cnicOrNull } from "@/lib/cnic";
import { buildSchedule, markupOf } from "@/lib/installment-calc";
import { withState, type PlanLean } from "@/lib/installments";
import { round2 } from "@/lib/money";
import { createSale, SaleBody } from "@/lib/sales";
import { InstallmentPlan, nextNumber, Party } from "@/models";

/** Plans (?status=active|completed|cancelled|all, ?due=late|today, ?q name / phone / CNIC / plan / bill). */
export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "active";
  const query: Record<string, unknown> = { tenant: ctx.tid };
  if (status !== "all") query.status = status;
  const branch = ctx.user.role === "cashier" ? ctx.branchId : reportBranchFilter(ctx, url.searchParams.get("branch"));
  if (branch) query.branch = branch;
  const customer = url.searchParams.get("customer");
  if (customer) query.customer = customer;
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ planNo: rx }, { invoiceNo: rx }, { customerName: rx }, { customerPhone: rx }, { customerCnic: rx }, { itemsText: rx }];
  }
  const rows = ((await InstallmentPlan.find(query).sort({ createdAt: -1 }).limit(1000).select("-payments").lean()) as unknown as PlanLean[]).map((p) => {
    const s = withState(p);
    return { ...s, rows: undefined };
  });
  const due = url.searchParams.get("due");
  const filtered = due === "late" ? rows.filter((r) => r.lateCount > 0) : due === "today" ? rows.filter((r) => r.dueToday) : rows;
  return {
    rows: filtered,
    summary: {
      active: rows.filter((r) => r.status === "active").length,
      outstanding: round2(rows.filter((r) => r.status === "active").reduce((a, r) => a + r.balance, 0)),
      overdue: round2(rows.reduce((a, r) => a + (r.status === "active" ? r.overdue : 0), 0)),
      latePlans: rows.filter((r) => r.status === "active" && r.lateCount > 0).length,
    },
  };
});

const PlanBody = z.object({
  months: z.coerce.number().int().min(1, "At least 1 month").max(60),
  markupType: z.enum(["percent", "amount"]).default("percent"),
  markupValue: z.coerce.number().min(0).max(10_000_000).default(0),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first due date"),
  customerCnic: z.string().trim().min(1, "Enter the customer's CNIC"),
  customerAddress: z.string().trim().max(200).optional(),
  guarantor: z
    .object({ name: z.string().trim().min(3).max(80), cnic: z.string().trim(), phone: z.string().trim().max(20).optional(), address: z.string().trim().max(200).optional(), relation: z.string().trim().max(40).optional() })
    .optional(),
  notes: z.string().trim().max(300).optional(),
});

/** Sells on installments: makes the bill (advance = what is paid now) and the plan for the rest. */
export const POST = handle(async (req) => {
  const ctx = await requireBranch();
  const { user, tid, branchId, branch } = ctx;
  const raw = await req.json();
  const sale = SaleBody.parse(raw.sale);
  const plan = PlanBody.parse(raw.plan ?? {});
  const cnic = cnicOrNull(plan.customerCnic);
  if (!cnic) throw new ApiError(400, "Customer CNIC must have 13 digits.");
  let guarantorCnic: string | undefined;
  if (plan.guarantor) {
    guarantorCnic = cnicOrNull(plan.guarantor.cnic) ?? undefined;
    if (!guarantorCnic) throw new ApiError(400, "Guarantor CNIC must have 13 digits.");
  }
  if (!sale.customerId) throw new ApiError(400, "Choose the customer who buys on installments.");
  const customer = await Party.findOne({ _id: sale.customerId, tenant: tid, type: "customer" }).lean();
  if (!customer) throw new ApiError(400, "Customer not found.");
  const firstDue = new Date(`${plan.firstDue}T12:00:00`);
  if (firstDue < new Date(Date.now() - 864e5)) throw new ApiError(400, "The first due date cannot be in the past.");

  const bill = await createSale(ctx, sale, { installment: true });
  if (!bill) throw new ApiError(500, "The bill could not be saved.");
  const base = round2(bill.total - bill.amountPaid);
  const markup = markupOf(plan.markupType, plan.markupValue, base);
  const financed = round2(base + markup);
  const planNo = await nextNumber(tid, "installment", "QST");
  const itemsText = bill.items.map((i) => `${i.name}${i.serials?.length ? ` (IMEI ${i.serials.map((x) => x.imei).join(", ")})` : i.qty !== 1 ? ` ×${i.qty}` : ""}`).join("; ");
  const doc = await InstallmentPlan.create({
    tenant: tid,
    planNo,
    branch: branchId,
    branchName: branch.name,
    customer: customer._id,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerCnic: cnic,
    customerAddress: plan.customerAddress || customer.address,
    guarantor: plan.guarantor ? { ...plan.guarantor, cnic: guarantorCnic } : undefined,
    sale: bill._id,
    invoiceNo: bill.invoiceNo,
    itemsText,
    cashPrice: bill.total,
    advance: bill.amountPaid,
    markupType: plan.markupType,
    markupValue: plan.markupValue,
    markup,
    financed,
    months: plan.months,
    schedule: financed > 0 ? buildSchedule(financed, plan.months, firstDue) : [],
    status: financed > 0 ? "active" : "completed",
    notes: plan.notes,
    user: user.id,
    userName: user.name,
  });
  await logActivity(
    { tid, user, branchId },
    { action: "installment.create", summary: `${planNo} for ${customer.name}: bill ${bill.invoiceNo} Rs ${bill.total}, advance Rs ${bill.amountPaid}, markup Rs ${markup}, ${plan.months} × ~Rs ${doc.schedule[0]?.amount ?? 0}`, refType: "installment", refId: doc._id, refNo: planNo, amount: financed },
  );
  return { plan: withState(doc.toObject() as PlanLean), sale: bill };
});
