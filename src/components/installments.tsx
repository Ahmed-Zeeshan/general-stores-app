"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Badge, Button, Field, Input, Modal, Select } from "./ui";
import { useToast } from "./toast";
import type { PartyLite } from "./customer-picker";
import { api, formatDate, todayISO } from "@/lib/client";
import { cnicOrNull } from "@/lib/cnic";
import { buildSchedule, markupOf } from "@/lib/installment-calc";
import { formatPKR, round2 } from "@/lib/money";
import { installmentMessage, openWhatsApp, waNumber } from "@/lib/whatsapp";

export type PlanRow = {
  _id: string;
  planNo: string;
  customer: string;
  customerName: string;
  customerPhone?: string;
  customerCnic?: string;
  customerAddress?: string;
  guarantor?: { name: string; cnic: string; phone?: string; address?: string; relation?: string };
  sale: string;
  invoiceNo: string;
  itemsText?: string;
  cashPrice: number;
  advance: number;
  markupType: "percent" | "amount";
  markupValue: number;
  markup: number;
  financed: number;
  months: number;
  schedule: { no: number; dueDate: string; amount: number }[];
  rows?: { no: number; dueDate: string; amount: number; paid: number; left: number; state: "paid" | "part" | "due" | "late" }[];
  payments?: { _id: string; kind: "payment" | "reversal" | "refund"; amount: number; method: string; ref?: string; note?: string; receiptNo?: string; reverses?: string; reversed?: boolean; at: string; userName?: string }[];
  paid: number;
  status: "active" | "completed" | "cancelled";
  balance: number;
  overdue: number;
  lateCount: number;
  daysLate: number;
  next: { no: number; dueDate: string; amount: number } | null;
  dueToday?: boolean;
  writtenOff?: number;
  cancelReason?: string;
  lastReminderAt?: string;
  notes?: string;
  userName?: string;
  createdAt: string;
};

/** Running / late / paid off / closed. */
export function PlanStatus({ plan }: { plan: Pick<PlanRow, "status" | "lateCount"> }) {
  if (plan.status === "completed") return <Badge color="green">Paid off</Badge>;
  if (plan.status === "cancelled") return <Badge color="slate">Closed</Badge>;
  if (plan.lateCount > 0) return <Badge color="red">Late</Badge>;
  return <Badge color="blue">Running</Badge>;
}

/** Opens WhatsApp with a reminder (or a payment confirmation). False when the customer has no mobile number. */
export function sendInstallmentWhatsApp(kind: "reminder" | "paid", p: PlanRow, shop: { shopName: string; phone?: string }, paid?: { amount: number; receiptNo?: string }) {
  const phone = waNumber(p.customerPhone);
  if (!phone) return false;
  openWhatsApp(
    phone,
    installmentMessage(kind, {
      name: p.customerName,
      planNo: p.planNo,
      items: p.itemsText && p.itemsText.length <= 60 ? p.itemsText : undefined,
      amount: paid?.amount ?? p.next?.amount ?? 0,
      dueDate: p.next?.dueDate,
      overdue: p.overdue,
      balance: p.balance,
      receiptNo: paid?.receiptNo,
      shop: shop.shopName,
      shopPhone: shop.phone,
    }),
  );
  return true;
}

const TENDERS = [
  ["cash", "Cash"],
  ["jazzcash", "JazzCash"],
  ["easypaisa", "Easypaisa"],
  ["card", "Card"],
  ["bank", "Bank"],
] as const;

/** Sell the bill on installments: advance now, the rest (+ markup) in monthly installments. */
export function InstallmentSaleModal({
  open,
  onClose,
  total,
  customer,
  onChooseCustomer,
  payload,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  customer: PartyLite | null;
  onChooseCustomer: () => void;
  payload: { items: unknown[]; discount: number; customerId?: string; redeemPoints?: number };
  onDone: (r: { plan: PlanRow; sale: { _id: string; invoiceNo: string; total: number } }) => void;
}) {
  const toast = useToast();
  const [advance, setAdvance] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("cash");
  const [months, setMonths] = useState("6");
  const [markupType, setMarkupType] = useState<"percent" | "amount">("percent");
  const [markupValue, setMarkupValue] = useState("0");
  const [firstDue, setFirstDue] = useState(todayISO(30));
  const [cnic, setCnic] = useState("");
  const [address, setAddress] = useState("");
  const [g, setG] = useState({ name: "", cnic: "", phone: "", relation: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setAdvance("");
    setFirstDue(todayISO(30));
  }, [open]);

  const adv = Math.min(total, Number(advance) || 0);
  const base = round2(total - adv);
  const markup = markupOf(markupType, Number(markupValue) || 0, base);
  const financed = round2(base + markup);
  const m = Math.max(1, Math.min(60, Number(months) || 1));
  const schedule = useMemo(() => (financed > 0 ? buildSchedule(financed, m, new Date(`${firstDue}T12:00:00`)) : []), [financed, m, firstDue]);
  const cnicOk = !!cnicOrNull(cnic);

  async function save() {
    if (!customer) return toast.error("Choose the customer first.");
    if (!cnicOk) return toast.error("Enter the customer's 13-digit CNIC.");
    if (g.name && !cnicOrNull(g.cnic)) return toast.error("Enter the guarantor's 13-digit CNIC.");
    setSaving(true);
    try {
      const r = await api<{ plan: PlanRow; sale: { _id: string; invoiceNo: string; total: number } }>("/api/installments", {
        body: {
          sale: { ...payload, customerId: customer._id, ...(adv > 0 ? { payments: [{ method: advanceMethod, amount: adv }] } : { paymentMethod: "credit", amountPaid: 0 }) },
          plan: {
            months: m,
            markupType,
            markupValue: Number(markupValue) || 0,
            firstDue,
            customerCnic: cnic,
            customerAddress: address || undefined,
            ...(g.name ? { guarantor: { name: g.name, cnic: g.cnic, phone: g.phone || undefined, relation: g.relation || undefined } } : {}),
          },
        },
      });
      toast.success(`${r.plan.planNo} saved — ${m} installments`);
      onDone(r);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sell on installments (qist)"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button loading={saving} disabled={!customer || !cnicOk || financed <= 0} icon={<CalendarRange className="h-4 w-4" />} onClick={save}>
            Save & print agreement
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <div className="text-sm text-slate-300">Bill (cash price)</div>
            <div className="text-3xl font-extrabold">{formatPKR(total)}</div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <span>{customer ? <b>{customer.name}</b> : <span className="text-rose-600">Choose the customer (needed)</span>}</span>
            <Button size="sm" variant="outline" onClick={onChooseCustomer}>{customer ? "Change" : "Choose customer"}</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer CNIC *" error={cnic && !cnicOk ? "13 digits" : undefined}>
              <Input value={cnic} onChange={(e) => setCnic(e.target.value)} onBlur={() => cnicOk && setCnic(cnicOrNull(cnic)!)} placeholder="34101-1234567-1" aria-label="Customer CNIC" />
            </Field>
            <Field label="Address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Customer address" />
            </Field>
            <Field label="Advance now (Rs)">
              <Input type="number" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} aria-label="Advance" />
            </Field>
            <Field label="Advance paid by">
              <Select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value)} aria-label="Advance method">
                {TENDERS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Months">
              <Select value={months} onChange={(e) => setMonths(e.target.value)} aria-label="Months">
                {[2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 24].map((n) => (
                  <option key={n} value={n}>{n} months</option>
                ))}
              </Select>
            </Field>
            <Field label="First installment due">
              <Input type="date" min={todayISO()} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} aria-label="First due date" />
            </Field>
            <Field label="Markup">
              <Select value={markupType} onChange={(e) => setMarkupType(e.target.value as "percent" | "amount")} aria-label="Markup type">
                <option value="percent">% of the rest</option>
                <option value="amount">Fixed (Rs)</option>
              </Select>
            </Field>
            <Field label={markupType === "percent" ? "Markup %" : "Markup Rs"}>
              <Input type="number" min="0" step="any" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} aria-label="Markup value" />
            </Field>
          </div>
          <details className="rounded-xl border border-slate-200 p-3 text-sm" open={!!g.name}>
            <summary className="cursor-pointer font-semibold text-slate-700">Guarantor (zamin) — optional</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} aria-label="Guarantor name" />
              </Field>
              <Field label="CNIC">
                <Input value={g.cnic} onChange={(e) => setG({ ...g, cnic: e.target.value })} aria-label="Guarantor CNIC" />
              </Field>
              <Field label="Mobile">
                <Input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} aria-label="Guarantor mobile" />
              </Field>
              <Field label="Relation">
                <Input value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })} placeholder="Brother, friend…" aria-label="Guarantor relation" />
              </Field>
            </div>
          </details>
        </div>
        <div>
          <div className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Cash price</span><b>{formatPKR(total)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Advance</span><b>−{formatPKR(adv)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Markup</span><b>+{formatPKR(markup)}</b></div>
            <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-base font-bold"><span>In installments</span><span>{formatPKR(financed)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Customer pays in all</span><span>{formatPKR(adv + financed)}</span></div>
          </div>
          {schedule.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1">No.</th>
                  <th className="py-1">Due date</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={r.no} className="border-t border-slate-100">
                    <td className="py-1">{r.no}</td>
                    <td className="py-1">{formatDate(r.dueDate as Date)}</td>
                    <td className="py-1 text-right font-semibold whitespace-nowrap">{formatPKR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
