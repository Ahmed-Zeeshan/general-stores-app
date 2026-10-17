"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, HandCoins, MessageCircle, Printer, RotateCcw } from "lucide-react";
import { Badge, Button, Card, cn, Count, Field, Input, Modal, Select, Spinner, Table, Td, Textarea, Th } from "@/components/ui";
import { PlanStatus, sendInstallmentWhatsApp, type PlanRow } from "@/components/installments";
import { useCan, useSession } from "@/components/session";
import { useShareLink } from "@/components/send-whatsapp";
import { useToast } from "@/components/toast";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR, round2 } from "@/lib/money";
import { useT } from "@/lib/i18n";

const TENDERS = ["cash", "jazzcash", "easypaisa", "card", "bank"];
const STATE_BADGE = {
  paid: <Badge color="green">Paid</Badge>,
  part: <Badge color="amber">Part paid</Badge>,
  due: <Badge color="slate">Due</Badge>,
  late: <Badge color="red">Late</Badge>,
} as const;

export default function InstallmentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const t = useT();
  const can = useCan();
  const { settings } = useSession();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [paying, setPaying] = useState(false);
  const [reversing, setReversing] = useState<NonNullable<PlanRow["payments"]>[number] | null>(null);
  const [closing, setClosing] = useState(false);
  const [lastPaid, setLastPaid] = useState<{ amount: number; receiptNo: string } | null>(null);
  const link = useShareLink("installment", id);

  const load = useCallback(() => {
    api<PlanRow>(`/api/installments/${id}`)
      .then(setPlan)
      .catch((e) => toast.error(e.message));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!plan) return <Spinner />;
  const shop = { shopName: settings?.shopName ?? "", phone: settings?.phone };
  const remind = async () => {
    if (!sendInstallmentWhatsApp("reminder", plan, shop, undefined, link)) return toast.error(t("The customer's mobile number is not a valid WhatsApp number."));
    await api(`/api/installments/${id}/remind`, { method: "POST" }).catch(() => {});
    load();
  };
  const payments = [...(plan.payments ?? [])].reverse();
  const rows = plan.rows ?? [];

  return (
    <div>
      <Link href="/installments" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {t("All installment plans")}
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{plan.planNo}</h1>
            <PlanStatus plan={plan} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {plan.customerName} · {t("bill")}{" "}
            <a href={`/receipt/${plan.sale}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
              {plan.invoiceNo}
            </a>{" "}
            · {formatDate(plan.createdAt, true)}
            {plan.userName && ` ${t("by {name}", { name: plan.userName })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/installment/${plan._id}?print=1`, "_blank")}>
            Print agreement
          </Button>
          {plan.status === "active" && (
            <Button variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={remind}>
              WhatsApp reminder
            </Button>
          )}
          {plan.status === "active" && (
            <Button icon={<HandCoins className="h-4 w-4" />} onClick={() => setPaying(true)}>
              Receive installment
            </Button>
          )}
        </div>
      </div>

      {plan.status === "active" && plan.lateCount > 0 && (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <b>{t("{amount} late", { amount: formatPKR(plan.overdue) })}</b> — <Count n={plan.lateCount} one="{n} installment" many="{n} installments" />, {t("oldest")} <Count n={plan.daysLate} one="{n} day ago" many="{n} days ago" />.
            {plan.lastReminderAt && <span className="text-sm"> {t("Last reminder {date}.", { date: formatDate(plan.lastReminderAt) })}</span>}
          </div>
          <Button size="sm" variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={remind}>
            Send reminder
          </Button>
        </div>
      )}
      {plan.status === "cancelled" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <b>{t("Closed.")}</b> {plan.cancelReason}
          {plan.takenBack && (
            <>
              {" · "}
              <a href={`/receipt/return/${plan.takenBack.ret}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                {t("Return slip {no}", { no: plan.takenBack.returnNo })}
              </a>
            </>
          )}
          {plan.writtenOff ? ` · ${t("{amount} not collected.", { amount: formatPKR(plan.writtenOff) })}` : ""}
        </div>
      )}
      {lastPaid && (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <b>{formatPKR(lastPaid.amount)}</b> {t("received — receipt {no}.", { no: lastPaid.receiptNo })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/installment/${plan._id}?receipt=${lastPaid.receiptNo}&print=1`, "_blank")}>
              Print receipt
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}
              onClick={() => {
                if (!sendInstallmentWhatsApp("paid", plan, shop, lastPaid, link)) toast.error(t("The customer's mobile number is not a valid WhatsApp number."));
              }}
            >
              WhatsApp confirmation
            </Button>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Money label="Cash price" value={plan.cashPrice} />
        <Money label="Advance" value={plan.advance} />
        <Money label={`Markup${plan.markupType === "percent" ? ` (${plan.markupValue}%)` : ""}`} value={plan.markup} />
        <Money label="In installments" value={plan.financed} hint={t("{n} months", { n: plan.months })} />
        <Money label="Received" value={plan.paid} tone="green" />
        <Money label="Left to pay" value={plan.status === "active" ? plan.balance : 0} tone={plan.status === "active" && plan.balance > 0 ? "amber" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card>
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-900">{t("Monthly installments")}</h2>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>No.</Th>
                  <Th>Due date</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Left</Th>
                  <Th>State</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.no} className={cn(r.state === "late" && plan.status === "active" && "bg-rose-50/40")}>
                    <Td className="font-semibold">{r.no}</Td>
                    <Td>{formatDate(r.dueDate)}</Td>
                    <Td className="text-right">{formatPKR(r.amount)}</Td>
                    <Td className="text-right">{r.paid ? formatPKR(r.paid) : "—"}</Td>
                    <Td className="text-right font-semibold">{r.left ? formatPKR(r.left) : "—"}</Td>
                    <Td>{plan.status === "cancelled" && r.left > 0 ? <Badge color="slate">Not collected</Badge> : STATE_BADGE[r.state]}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-900">{t("Money received")}</h2>
              <p className="text-xs text-slate-500">{t("The advance ({amount}) is on the bill itself.", { amount: formatPKR(plan.advance) })}</p>
            </div>
            {payments.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">{t("No installment received yet.")}</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Receipt</Th>
                    <Th>Date</Th>
                    <Th>Paid by</Th>
                    <Th className="text-right">Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className={cn(p.reversed && "text-slate-400 line-through")}>
                      <Td>
                        <div className="font-semibold">{p.receiptNo ?? (p.kind === "refund" ? t("Refund") : t("Cancelled"))}</div>
                        {p.kind === "reversal" && <div className="text-xs text-rose-600 no-underline">{t("Cancels a payment — {note}", { note: p.note ?? "" })}</div>}
                        {p.kind === "refund" && <div className="text-xs text-slate-500">{p.note}</div>}
                      </Td>
                      <Td>
                        <div>{formatDate(p.at, true)}</div>
                        {p.userName && <div className="text-xs text-slate-500">{p.userName}</div>}
                      </Td>
                      <Td>
                        {t(PAYMENT_LABELS[p.method] ?? p.method)}
                        {p.ref && <div className="text-xs text-slate-500">{p.ref}</div>}
                      </Td>
                      <Td className={cn("text-right font-semibold", p.amount < 0 && "text-rose-600")}>{formatPKR(p.amount)}</Td>
                      <Td className="text-right">
                        {p.kind === "payment" && !p.reversed && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" aria-label={`Print receipt ${p.receiptNo}`} icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/installment/${plan._id}?receipt=${p.receiptNo}&print=1`, "_blank")} />
                            {can.manage && plan.status !== "cancelled" && (
                              <Button size="sm" variant="ghost" className="hover:text-rose-600" aria-label={`Cancel payment ${p.receiptNo}`} icon={<RotateCcw className="h-4 w-4" />} onClick={() => setReversing(p)} />
                            )}
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-900">{t("Customer")}</h2>
            <dl className="space-y-2 text-sm">
              <Info label="Name">
                {plan.customerName}
                <Link href={`/customers/${plan.customer}`} className="ml-2 text-xs font-semibold text-brand-700">
                  {t("profile")}
                </Link>
              </Info>
              <Info label="Mobile">{plan.customerPhone || "—"}</Info>
              <Info label="CNIC">{plan.customerCnic || "—"}</Info>
              <Info label="Address">{plan.customerAddress || "—"}</Info>
            </dl>
            {plan.guarantor?.name && (
              <>
                <h3 className="mb-2 mt-5 font-bold text-slate-900">{t("Guarantor (zamin)")}</h3>
                <dl className="space-y-2 text-sm">
                  <Info label="Name">
                    {plan.guarantor.name}
                    {plan.guarantor.relation && <span className="text-slate-500"> ({plan.guarantor.relation})</span>}
                  </Info>
                  <Info label="CNIC">{plan.guarantor.cnic}</Info>
                  <Info label="Mobile">{plan.guarantor.phone || "—"}</Info>
                </dl>
              </>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-bold text-slate-900">{t("Goods")}</h2>
            <p className="text-sm text-slate-700">{plan.itemsText}</p>
            {plan.notes && <p className="mt-2 text-sm text-slate-500">{plan.notes}</p>}
          </Card>
          {can.manage && plan.status !== "cancelled" && (
            <Card className="p-5">
              <h2 className="mb-1 font-bold text-slate-900">{t("Close this plan")}</h2>
              <p className="mb-3 text-sm text-slate-500">{t("When the customer stops paying: take the goods back into stock and stop the installments.")}</p>
              <Button variant="outline" className="w-full hover:text-rose-600" icon={<Ban className="h-4 w-4" />} onClick={() => setClosing(true)}>
                Close plan
              </Button>
            </Card>
          )}
        </div>
      </div>

      <PayModal
        open={paying}
        plan={plan}
        onClose={() => setPaying(false)}
        onDone={(r) => {
          setPaying(false);
          setPlan(r);
          setLastPaid({ amount: r.paidNow, receiptNo: r.receiptNo });
          toast.success(r.status === "completed" ? t("{no}: fully paid — plan completed", { no: r.receiptNo }) : t("{no}: {amount} received", { no: r.receiptNo, amount: formatPKR(r.paidNow) }));
        }}
      />
      <ReverseModal
        payment={reversing}
        planId={plan._id}
        onClose={() => setReversing(null)}
        onDone={(r) => {
          setReversing(null);
          setPlan(r);
          setLastPaid(null);
          toast.success(t("Payment cancelled"));
        }}
      />
      <CloseModal
        open={closing}
        plan={plan}
        onClose={() => setClosing(false)}
        onDone={(r) => {
          setClosing(false);
          setPlan(r);
          setLastPaid(null);
          toast.success(t("{no} closed", { no: r.planNo }));
        }}
      />
    </div>
  );
}

function Money({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "green" | "amber" }) {
  const t = useT();
  return (
    <div className={cn("rounded-2xl border p-3", tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white")}>
      <div className="text-xs font-medium text-slate-500">{t(label)}</div>
      <div className="text-lg font-extrabold text-slate-900">{formatPKR(value)}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-500">{t(label)}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function PayModal({ open, plan, onClose, onDone }: { open: boolean; plan: PlanRow; onClose: () => void; onDone: (r: PlanRow & { receiptNo: string; paidNow: number }) => void }) {
  const toast = useToast();
  const t = useT();
  const suggested = plan.overdue > 0 ? plan.overdue : (plan.next?.amount ?? plan.balance);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.min(plan.balance, suggested)));
    setMethod("cash");
    setRef("");
  }, [open, plan.balance, suggested]);
  const n = round2(Number(amount) || 0);

  async function save() {
    setSaving(true);
    try {
      const r = await api<PlanRow & { receiptNo: string }>(`/api/installments/${plan._id}/pay`, { body: { amount: n, method, ...(ref.trim() ? { ref: ref.trim() } : {}) } });
      onDone({ ...r, paidNow: n });
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
      title={t("Receive installment — {name}", { name: plan.customerName })}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={n <= 0 || n > plan.balance + 0.004} icon={<HandCoins className="h-4 w-4" />} onClick={save}>
            {n > 0 ? t("Save {amount}", { amount: formatPKR(n) }) : `${t("Save")} `}
          </Button>
        </>
      }
    >
      <div className="mb-4 space-y-1 rounded-2xl bg-slate-50 p-4 text-sm">
        {plan.overdue > 0 && (
          <div className="flex justify-between text-rose-700">
            <span>{t("Late")}</span>
            <b>{formatPKR(plan.overdue)}</b>
          </div>
        )}
        {plan.next && (
          <div className="flex justify-between">
            <span className="text-slate-500">{t("Next ({date})", { date: formatDate(plan.next.dueDate) })}</span>
            <b>{formatPKR(plan.next.amount)}</b>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-slate-200 pt-1">
          <span className="text-slate-500">{t("Left on the plan")}</span>
          <b>{formatPKR(plan.balance)}</b>
        </div>
      </div>
      <Field label="Amount received" hint="Any amount; it pays the oldest month first.">
        <Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-xl font-bold" aria-label="Amount received" />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        {Array.from(new Set([suggested, plan.balance].filter((x) => x > 0))).map((x) => (
          <button key={x} type="button" onClick={() => setAmount(String(x))} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">
            {x === plan.balance ? t("All {amount}", { amount: formatPKR(x) }) : formatPKR(x)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Paid by">
          <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid by">
            {TENDERS.map((m) => (
              <option key={m} value={m}>
                {t(PAYMENT_LABELS[m] ?? m)}
              </option>
            ))}
          </Select>
        </Field>
        {method !== "cash" && (
          <Field label="Transaction ID">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} aria-label="Transaction ID" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ReverseModal({ payment, planId, onClose, onDone }: { payment: NonNullable<PlanRow["payments"]>[number] | null; planId: string; onClose: () => void; onDone: (r: PlanRow) => void }) {
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setReason(""), [payment]);
  async function save() {
    if (!payment) return;
    setSaving(true);
    try {
      onDone(await api<PlanRow>(`/api/installments/${planId}/payments/${payment._id}/reverse`, { body: { reason } }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={!!payment}
      onClose={onClose}
      title={t("Cancel payment {no}", { no: payment?.receiptNo ?? "" })}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={saving} disabled={reason.trim().length < 3} onClick={save}>
            Cancel payment
          </Button>
        </>
      }
    >
      {payment && (
        <p className="mb-3 text-sm text-slate-600">
          {t("{amount} received on {date} will be removed and the months will show as unpaid again. Use this for a payment entered by mistake.", { amount: formatPKR(payment.amount), date: formatDate(payment.at, true) })}
        </p>
      )}
      <Field label="Reason">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} aria-label="Reason" />
      </Field>
    </Modal>
  );
}

function CloseModal({ open, plan, onClose, onDone }: { open: boolean; plan: PlanRow; onClose: () => void; onDone: (r: PlanRow) => void }) {
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState("");
  const [takeBack, setTakeBack] = useState(true);
  const [refund, setRefund] = useState("");
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setTakeBack(plan.status === "active");
    setRefund("");
    setMethod("cash");
  }, [open, plan.status]);
  const totalIn = round2(plan.paid + plan.advance);
  const r = Number(refund) || 0;
  async function save() {
    setSaving(true);
    try {
      onDone(await api<PlanRow>(`/api/installments/${plan._id}/cancel`, { body: { reason, takeBack, refund: r, method } }));
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
      title={t("Close {no}", { no: plan.planNo })}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={saving} disabled={reason.trim().length < 3 || r > totalIn} onClick={save}>
            Close plan
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {t("The customer has paid {amount} so far (advance + installments).", { amount: formatPKR(totalIn) })}
        {plan.status === "active" && ` ${t("{amount} is still unpaid and will not be collected.", { amount: formatPKR(plan.balance) })}`}
      </p>
      <Field label="Reason">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={t("Customer stopped paying, phone returned…")} aria-label="Reason" />
      </Field>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <input type="checkbox" checked={takeBack} onChange={(e) => setTakeBack(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" aria-label="Take the goods back" />
        <span>
          <b>{t("Take the goods back into stock")}</b>
          <span className="block text-slate-500">{plan.itemsText}</span>
        </span>
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Give money back (optional)" error={r > totalIn ? t("Not more than {amount}", { amount: formatPKR(totalIn) }) : undefined}>
          <Input type="number" min="0" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="0" aria-label="Refund" />
        </Field>
        {r > 0 && (
          <Field label="Given back by">
            <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Refund method">
              {TENDERS.map((m) => (
                <option key={m} value={m}>
                  {t(PAYMENT_LABELS[m] ?? m)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
