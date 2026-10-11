"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, CheckCircle2, Eye, HandCoins, MessageCircle, PackageCheck, Plus, Printer, RotateCcw, Save, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Textarea, cn } from "@/components/ui";
import { RepairStatusBadge, isLate, sendRepairWhatsApp, type RepairJob } from "@/components/repairs";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR, formatQty, round2 } from "@/lib/money";
import { REPAIR_STATUS_LABELS, type RepairStatus } from "@/lib/constants";

type Part = { _id: string; name: string; salePrice: number; stock: number; trackSerial?: boolean; barcode?: string };
const STEPS: RepairStatus[] = ["received", "checking", "waiting_parts", "repairing", "ready"];
const TENDERS = ["cash", "jazzcash", "easypaisa", "card", "bank"];

export default function RepairJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const can = useCan();
  const { settings } = useSession();
  const [job, setJob] = useState<RepairJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<"payment" | "refund" | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showLock, setShowLock] = useState(false);

  const load = useCallback(() => {
    api<RepairJob>(`/api/repairs/${id}`)
      .then(setJob)
      .catch((e) => toast.error(e.message));
  }, [id, toast]);
  useEffect(load, [load]);

  async function act<T>(fn: () => Promise<T>, msg?: string) {
    setBusy(true);
    try {
      const r = (await fn()) as unknown as RepairJob;
      setJob(r);
      if (msg) toast.success(msg);
      return r;
    } catch (err) {
      toast.error((err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!job) return <Spinner />;
  const open = !["delivered", "cancelled"].includes(job.status);
  const balance = job.balance ?? round2(job.total - job.paid - (job.creditAmount ?? 0));
  const shop = { shopName: settings?.shopName ?? "", phone: settings?.phone };
  const whatsapp = (kind: "booked" | "ready" | "delivered") => {
    if (!sendRepairWhatsApp(kind, job, shop)) toast.error("The customer's mobile number is not a valid WhatsApp number.");
  };
  const setStatus = (status: RepairStatus) => act(() => api(`/api/repairs/${id}/status`, { body: { status } }), `Status: ${REPAIR_STATUS_LABELS[status]}`);

  return (
    <div>
      <Link href="/repairs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All repairs
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{job.jobNo}</h1>
            <RepairStatusBadge status={job.status} />
            {job.warrantyOf && <Badge color="violet">Warranty claim of {job.warrantyOf}</Badge>}
            {isLate(job) && <Badge color="red">Late</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {job.deviceName} · {job.customerName} · booked {formatDate(job.createdAt, true)}
            {job.userName && ` by ${job.userName}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/repair/${job._id}?print=1`, "_blank")}>
            {job.status === "delivered" ? "Print bill" : "Print slip"}
          </Button>
          <Button variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => whatsapp(job.status === "ready" ? "ready" : job.status === "delivered" ? "delivered" : "booked")}>
            WhatsApp
          </Button>
        </div>
      </div>

      {open && (
        <Card className="mb-6 p-4">
          <div className="scrollbar-thin flex gap-2 overflow-x-auto">
            {STEPS.map((s, i) => {
              const at = STEPS.indexOf(job.status);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={busy || s === job.status}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    s === job.status ? "border-brand-600 bg-brand-600 text-white" : i < at ? "border-brand-200 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-brand-300",
                  )}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs", s === job.status ? "bg-white/25" : "bg-slate-100")}>{i + 1}</span>
                  {REPAIR_STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
          {job.status === "ready" && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Ready. Tell the customer:
              <Button size="sm" variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => whatsapp("ready")}>
                Send “ready” on WhatsApp
              </Button>
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-900">Customer & phone</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Info label="Customer">
                {job.customerName}
                {job.customer && (
                  <Link href={`/customers/${job.customer}`} className="ml-2 text-xs font-semibold text-brand-700">
                    khata
                  </Link>
                )}
              </Info>
              <Info label="Mobile">{job.customerPhone}</Info>
              <Info label="Phone">{[job.deviceName, job.color].filter(Boolean).join(" · ")}</Info>
              <Info label="IMEI">{job.imei ? <span className="font-mono">{job.imei}</span> : "—"}</Info>
              <Info label="Screen lock">
                {job.lockCode ? (
                  showLock ? (
                    <span className="font-mono">{job.lockCode}</span>
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1 text-brand-700" onClick={() => setShowLock(true)}>
                      <Eye className="h-3.5 w-3.5" /> Show
                    </button>
                  )
                ) : (
                  "—"
                )}
              </Info>
              <Info label="Received with">{job.accessories?.length ? job.accessories.join(", ") : "Phone only"}</Info>
              <Info label="Condition" wide>{job.conditionNotes || "—"}</Info>
              <Info label="Problem" wide>
                <span className="font-semibold text-slate-900">{job.problem}</span>
              </Info>
              <Info label="Ready by">
                {job.promisedAt ? formatDate(job.promisedAt) : "—"}
                {job.estimate ? ` · estimate ${formatPKR(job.estimate)}` : ""}
              </Info>
              {job.warrantyUntil && <Info label="Repair warranty">till {formatDate(job.warrantyUntil)}</Info>}
            </dl>
          </Card>

          <WorkCard job={job} open={open} busy={busy} onSave={(body) => act(() => api(`/api/repairs/${id}`, { method: "PATCH", body }), "Saved")} canDiscount={can.manage} />

          <PartsCard job={job} open={open} canPrice={can.manage} onChange={(r) => setJob(r)} />

          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-900">History</h2>
            <ol className="space-y-1.5 border-l-2 border-slate-200 pl-4 text-sm">
              {(job.history ?? []).map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
                  {h.status && <span className="font-semibold text-slate-800">{REPAIR_STATUS_LABELS[h.status as RepairStatus] ?? h.status}</span>}
                  {h.note && <span className="text-slate-600"> · {h.note}</span>}
                  <span className="block text-xs text-slate-400">
                    {formatDate(h.at, true)}
                    {h.userName && ` · ${h.userName}`}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="order-first space-y-6 lg:order-none">
          <Card className="p-5 lg:sticky lg:top-6">
            <h2 className="mb-3 font-bold text-slate-900">Bill</h2>
            <div className="space-y-1.5 text-sm">
              <Row label="Parts" value={formatPKR(job.partsTotal ?? 0)} />
              <Row label="Labour / service" value={formatPKR(job.labour)} />
              {job.discount > 0 && <Row label="Discount" value={`−${formatPKR(job.discount)}`} />}
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-base font-bold">
                <span>Total</span>
                <span>{formatPKR(job.total)}</span>
              </div>
              <Row label="Paid" value={formatPKR(job.paid)} />
              {(job.creditAmount ?? 0) > 0 && <Row label="On khata" value={formatPKR(job.creditAmount!)} />}
              <div className={cn("flex justify-between text-base font-bold", balance > 0 ? "text-amber-700" : balance < 0 ? "text-rose-600" : "text-emerald-700")}>
                <span>{balance < 0 ? "To give back" : "Still to pay"}</span>
                <span>{formatPKR(Math.abs(balance))}</span>
              </div>
              {can.manage && job.partsCost !== undefined && job.status !== "cancelled" && (
                <p className="pt-1 text-xs text-slate-500">
                  Profit: {formatPKR(job.total - (job.partsCost ?? 0))} (parts cost {formatPKR(job.partsCost ?? 0)})
                </p>
              )}
            </div>
            {open && (
              <div className="mt-4 grid gap-2">
                <Button size="lg" icon={<PackageCheck className="h-5 w-5" />} onClick={() => setDelivering(true)}>
                  Deliver phone
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" icon={<HandCoins className="h-4 w-4" />} onClick={() => setPaying("payment")}>
                    Take payment
                  </Button>
                  {can.manage ? (
                    <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setPaying("refund")} disabled={job.paid <= 0}>
                      Give back
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
                {can.manage && (
                  <Button variant="ghost" className="text-rose-600" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(true)}>
                    Return without repair
                  </Button>
                )}
              </div>
            )}
            {job.status === "delivered" && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Delivered {formatDate(job.deliveredAt, true)}
                {job.deliveredByName && ` by ${job.deliveredByName}`}.
              </p>
            )}
            {job.status === "cancelled" && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Returned without repair — {job.cancelReason}</p>}
            {job.payments.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Payments</div>
                <ul className="space-y-1 text-sm">
                  {job.payments.map((p, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="text-slate-600">
                        {p.kind === "advance" ? "Advance" : p.kind === "refund" ? "Given back" : "Paid"} · {PAYMENT_LABELS[p.method] ?? p.method}
                        <span className="block text-xs text-slate-400">
                          {formatDate(p.at, true)}
                          {p.receiptNo && ` · ${p.receiptNo}`}
                        </span>
                      </span>
                      <span className={cn("whitespace-nowrap font-semibold", p.amount < 0 && "text-rose-600")}>{formatPKR(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>

      <PaymentModal
        kind={paying}
        job={job}
        onClose={() => setPaying(null)}
        onSave={async (body) => {
          const r = await act(() => api(`/api/repairs/${id}/payment`, { body: { ...body, kind: paying } }), paying === "refund" ? "Money given back" : "Payment received");
          if (r) setPaying(null);
        }}
        busy={busy}
      />
      <DeliverModal
        open={delivering}
        job={job}
        balance={balance}
        busy={busy}
        onClose={() => setDelivering(false)}
        onSave={async (body) => {
          const r = await act(() => api(`/api/repairs/${id}/deliver`, { body }), "Phone delivered");
          if (r) {
            setDelivering(false);
            window.open(`/receipt/repair/${id}?print=1`, "_blank");
          }
        }}
      />
      <CancelModal
        open={cancelling}
        job={job}
        busy={busy}
        onClose={() => setCancelling(false)}
        onSave={async (body) => {
          const r = await act(() => api(`/api/repairs/${id}/cancel`, { body }), "Returned without repair");
          if (r) setCancelling(false);
        }}
      />
    </div>
  );
}

function Info({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 sm:block", wide && "sm:col-span-2")}>
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800 sm:text-left">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/** Diagnosis, technician, labour, discount, warranty. */
function WorkCard({ job, open, busy, onSave, canDiscount }: { job: RepairJob; open: boolean; busy: boolean; onSave: (body: Record<string, unknown>) => void; canDiscount: boolean }) {
  const [f, setF] = useState({ diagnosis: "", labour: "", discount: "", warrantyDays: "", technicianId: "", promisedAt: "" });
  const [techs, setTechs] = useState<{ _id: string; name: string }[]>([]);
  useEffect(() => {
    setF({
      diagnosis: job.diagnosis ?? "",
      labour: String(job.labour ?? 0),
      discount: String(job.discount ?? 0),
      warrantyDays: job.warrantyDays !== undefined && job.warrantyDays !== null ? String(job.warrantyDays) : "",
      technicianId: job.technician ?? "",
      promisedAt: job.promisedAt ? job.promisedAt.slice(0, 10) : "",
    });
  }, [job]);
  useEffect(() => {
    api<{ _id: string; name: string }[]>("/api/repairs/technicians")
      .then(setTechs)
      .catch(() => {});
  }, []);
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-bold text-slate-900">Work & charges</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            diagnosis: f.diagnosis,
            labour: Number(f.labour) || 0,
            ...(canDiscount ? { discount: Number(f.discount) || 0 } : {}),
            warrantyDays: f.warrantyDays === "" ? "" : Number(f.warrantyDays),
            technicianId: f.technicianId,
            promisedAt: f.promisedAt,
          });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Diagnosis / work done" className="sm:col-span-2">
          <Textarea disabled={!open} value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} className="min-h-[60px]" aria-label="Diagnosis" />
        </Field>
        <Field label="Labour / service charge (Rs)">
          <Input disabled={!open} type="number" min="0" value={f.labour} onChange={(e) => setF({ ...f, labour: e.target.value })} aria-label="Labour" />
        </Field>
        <Field label="Discount (Rs)" hint={canDiscount ? undefined : "Owner or manager"}>
          <Input disabled={!open || !canDiscount} type="number" min="0" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} aria-label="Discount" />
        </Field>
        <Field label="Technician">
          <Select disabled={!open} value={f.technicianId} onChange={(e) => setF({ ...f, technicianId: e.target.value })} aria-label="Technician">
            <option value="">Not assigned</option>
            {techs.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ready by">
            <Input disabled={!open} type="date" value={f.promisedAt} onChange={(e) => setF({ ...f, promisedAt: e.target.value })} aria-label="Ready by" />
          </Field>
          <Field label="Warranty (days)">
            <Input disabled={!open} type="number" min="0" max="365" value={f.warrantyDays} onChange={(e) => setF({ ...f, warrantyDays: e.target.value })} aria-label="Warranty days" />
          </Field>
        </div>
        {open && (
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy} icon={<Save className="h-4 w-4" />}>
              Save
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/** Spare parts used on the job: taken from stock, charged on the bill. */
function PartsCard({ job, open, canPrice, onChange }: { job: RepairJob; open: boolean; canPrice: boolean; onChange: (j: RepairJob) => void }) {
  const toast = useToast();
  const [parts, setParts] = useState<Part[]>([]);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Part | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api<Part[]>("/api/products?limit=5000")
      .then((list) => setParts(list.filter((p) => !p.trackSerial)))
      .catch(() => {});
  }, [open]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return parts.filter((p) => p.name.toLowerCase().includes(t) || p.barcode === t).slice(0, 8);
  }, [q, parts]);

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      onChange(await api<RepairJob>(`/api/repairs/${job._id}/parts`, { body: { productId: pick._id, qty: Number(qty) || 1, ...(canPrice && price !== "" ? { price: Number(price) } : {}) } }));
      setPick(null);
      setQ("");
      setQty("1");
      setPrice("");
      toast.success("Part added (taken from stock)");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(partId: string) {
    setBusy(true);
    try {
      onChange(await api<RepairJob>(`/api/repairs/${job._id}/parts/${partId}`, { method: "DELETE" }));
      toast.success("Part removed (back in stock)");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-bold text-slate-900">Parts used</h2>
      {(job.parts ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No parts used yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {job.parts!.map((p) => (
            <li key={p._id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {formatQty(p.qty)} × {formatPKR(p.price)}
                  {p.userName && ` · ${p.userName}`}
                </div>
              </div>
              <span className="whitespace-nowrap font-semibold">{formatPKR(p.qty * p.price)}</span>
              {open && (
                <button type="button" disabled={busy} onClick={() => remove(p._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${p.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-4">
          {pick ? (
            <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{pick.name}</div>
                <div className="text-xs text-slate-500">In stock: {formatQty(pick.stock)}</div>
              </div>
              <Field label="Qty">
                <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20" aria-label="Part quantity" />
              </Field>
              {canPrice && (
                <Field label="Price each">
                  <Input type="number" min="0" value={price} placeholder={String(pick.salePrice)} onChange={(e) => setPrice(e.target.value)} className="w-28" aria-label="Part price" />
                </Field>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPick(null)}>Cancel</Button>
                <Button loading={busy} icon={<Plus className="h-4 w-4" />} onClick={add}>
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a part from stock: search name or scan" aria-label="Search parts" />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {matches.map((p) => (
                    <li key={p._id}>
                      <button type="button" onClick={() => setPick(p)} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span>{p.name}</span>
                        <span className={p.stock > 0 ? "text-slate-500" : "text-rose-600"}>
                          {formatPKR(p.salePrice)} · stock {formatQty(p.stock)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PaymentModal({ kind, job, onClose, onSave, busy }: { kind: "payment" | "refund" | null; job: RepairJob; onClose: () => void; onSave: (b: { amount: number; method: string; ref?: string }) => void; busy: boolean }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  useEffect(() => {
    setAmount("");
    setMethod("cash");
    setRef("");
  }, [kind]);
  return (
    <Modal open={!!kind} onClose={onClose} title={kind === "refund" ? `Give money back — ${job.jobNo}` : `Take payment — ${job.jobNo}`} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ amount: Number(amount), method, ref: ref || undefined });
        }}
        className="space-y-4"
      >
        <Field label="Amount (Rs)" hint={kind === "refund" ? `Paid so far: ${formatPKR(job.paid)}` : undefined}>
          <Input autoFocus required type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        </Field>
        <Field label={kind === "refund" ? "Given back by" : "Paid by"}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
            {TENDERS.map((m) => (
              <option key={m} value={m}>{PAYMENT_LABELS[m] ?? m}</option>
            ))}
          </Select>
        </Field>
        {method !== "cash" && (
          <Field label="Transaction ID (optional)">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Transaction ID" />
          </Field>
        )}
        <Button type="submit" className="w-full" loading={busy}>
          {kind === "refund" ? "Give back" : "Save payment"}
        </Button>
      </form>
    </Modal>
  );
}

function DeliverModal({ open, job, balance, busy, onClose, onSave }: { open: boolean; job: RepairJob; balance: number; busy: boolean; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [toKhata, setToKhata] = useState(false);
  useEffect(() => {
    setAmount(balance > 0 ? String(balance) : "");
    setMethod("cash");
    setToKhata(false);
  }, [open, balance]);
  const collect = Math.min(Number(amount) || 0, Math.max(0, balance));
  const left = round2(Math.max(0, balance) - collect);
  return (
    <Modal open={open} onClose={onClose} title={`Deliver ${job.deviceName} — ${job.jobNo}`} size="sm">
      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-900 p-4 text-center text-white">
          <div className="text-sm text-slate-300">{balance < 0 ? "Give back to the customer" : "To collect now"}</div>
          <div className="text-3xl font-extrabold">{formatPKR(Math.abs(balance))}</div>
          <div className="text-xs text-slate-400">
            Bill {formatPKR(job.total)} · paid {formatPKR(job.paid)}
          </div>
        </div>
        {balance > 0 && (
          <>
            <Field label="Amount received now">
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount received" />
            </Field>
            <Field label="Paid by">
              <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid by">
                {TENDERS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_LABELS[m] ?? m}</option>
                ))}
              </Select>
            </Field>
            {left > 0 &&
              (job.customer ? (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <input type="checkbox" checked={toKhata} onChange={(e) => setToKhata(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" aria-label="Put on khata" />
                  Put the remaining {formatPKR(left)} on {job.customerName}&apos;s khata (udhaar)
                </label>
              ) : (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{formatPKR(left)} still unpaid. Collect the full amount (this job has no khata customer).</p>
              ))}
          </>
        )}
        {balance < 0 && <p className="text-sm text-slate-600">The advance was more than the bill; the extra is given back when you deliver.</p>}
        <Button
          size="lg"
          className="w-full"
          loading={busy}
          disabled={left > 0 && !toKhata}
          icon={<PackageCheck className="h-5 w-5" />}
          onClick={() => onSave({ amount: balance > 0 ? collect : 0, method, toKhata })}
        >
          Deliver & print bill
        </Button>
      </div>
    </Modal>
  );
}

function CancelModal({ open, job, busy, onClose, onSave }: { open: boolean; job: RepairJob; busy: boolean; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [reason, setReason] = useState("");
  const [charge, setCharge] = useState("");
  const [method, setMethod] = useState("cash");
  useEffect(() => {
    setReason("");
    setCharge("");
    setMethod("cash");
  }, [open]);
  const keep = Number(charge) || 0;
  const back = round2(job.paid - keep);
  return (
    <Modal open={open} onClose={onClose} title={`Return without repair — ${job.jobNo}`} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ reason, charge: keep, method });
        }}
        className="space-y-4"
      >
        <p className="text-sm text-slate-600">The phone goes back to the customer unrepaired. Parts used go back into stock.</p>
        <Field label="Why?">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer did not want the repair, part not available" aria-label="Reason" />
        </Field>
        <Field label="Checking charge kept (Rs)" hint={`Paid so far: ${formatPKR(job.paid)}`}>
          <Input type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} aria-label="Checking charge" />
        </Field>
        {back > 0 && (
          <Field label={`Give back ${formatPKR(back)} by`}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Refund method">
              {TENDERS.map((m) => (
                <option key={m} value={m}>{PAYMENT_LABELS[m] ?? m}</option>
              ))}
            </Select>
          </Field>
        )}
        <Button type="submit" variant="danger" className="w-full" loading={busy} disabled={back < 0}>
          Return without repair
        </Button>
      </form>
    </Modal>
  );
}
