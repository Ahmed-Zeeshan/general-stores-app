"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { CustomerPicker, type PartyLite } from "./customer-picker";
import { useToast } from "./toast";
import { api, todayISO } from "@/lib/client";
import { REPAIR_ACCESSORIES, REPAIR_STATUS_LABELS, type RepairStatus } from "@/lib/constants";
import { openWhatsApp, repairMessage, waNumber } from "@/lib/whatsapp";

export type RepairJob = {
  _id: string;
  jobNo: string;
  branchName?: string;
  customer?: string;
  customerName: string;
  customerPhone: string;
  deviceName: string;
  imei?: string;
  color?: string;
  lockCode?: string;
  accessories?: string[];
  conditionNotes?: string;
  problem: string;
  diagnosis?: string;
  technician?: string;
  technicianName?: string;
  estimate?: number;
  promisedAt?: string;
  status: RepairStatus;
  parts?: { _id: string; product: string; name: string; qty: number; cost: number; price: number; at: string; userName?: string }[];
  labour: number;
  discount: number;
  payments: { kind: "advance" | "payment" | "refund"; amount: number; method: string; ref?: string; at: string; userName?: string; receiptNo?: string }[];
  total: number;
  paid: number;
  balance?: number;
  partsTotal?: number;
  partsCost?: number;
  creditAmount?: number;
  warrantyDays?: number;
  warrantyUntil?: string;
  warrantyOf?: string;
  readyAt?: string;
  deliveredAt?: string;
  deliveredByName?: string;
  cancelReason?: string;
  history?: { at: string; status?: string; note?: string; userName?: string }[];
  userName?: string;
  createdAt: string;
};

const STATUS_COLOR: Record<RepairStatus, "slate" | "blue" | "amber" | "violet" | "green" | "red"> = {
  received: "slate",
  checking: "blue",
  waiting_parts: "amber",
  repairing: "violet",
  ready: "green",
  delivered: "slate",
  cancelled: "red",
};

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return <Badge color={STATUS_COLOR[status]}>{REPAIR_STATUS_LABELS[status]}</Badge>;
}

/** True when the promised date has passed and the phone is still not ready. */
export function isLate(j: Pick<RepairJob, "promisedAt" | "status">) {
  return !!j.promisedAt && new Date(j.promisedAt) < new Date() && !["ready", "delivered", "cancelled"].includes(j.status);
}

/** Opens WhatsApp with the booked / ready / delivered message for this job. */
export function sendRepairWhatsApp(kind: "booked" | "ready" | "delivered", j: RepairJob, shop: { shopName: string; phone?: string }, link?: string | null) {
  const phone = waNumber(j.customerPhone);
  if (!phone) return false;
  openWhatsApp(
    phone,
    repairMessage(kind, {
      name: j.customerName,
      jobNo: j.jobNo,
      device: j.deviceName,
      problem: j.problem,
      total: j.total,
      paid: j.paid,
      balance: j.balance ?? Math.max(0, j.total - j.paid - (j.creditAmount ?? 0)),
      estimate: j.estimate,
      promisedAt: j.promisedAt,
      warrantyUntil: j.warrantyUntil,
      shop: shop.shopName,
      shopPhone: shop.phone,
      link,
    }),
  );
  return true;
}

type Tech = { _id: string; name: string };

/** Book a phone in: customer, phone, problem, estimate, advance. */
export function NewRepairModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (job: RepairJob) => void }) {
  const toast = useToast();
  const [techs, setTechs] = useState<Tech[]>([]);
  const [party, setParty] = useState<PartyLite | null>(null);
  const [pick, setPick] = useState(false);
  const empty = {
    customerName: "",
    customerPhone: "",
    deviceName: "",
    imei: "",
    color: "",
    lockCode: "",
    conditionNotes: "",
    problem: "",
    estimate: "",
    promisedAt: todayISO(2),
    technicianId: "",
    warrantyDays: "30",
    advance: "",
    advanceMethod: "cash",
    warrantyOf: "",
  };
  const [f, setF] = useState(empty);
  const [acc, setAcc] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(empty);
    setAcc([]);
    setParty(null);
    api<Tech[]>("/api/repairs/technicians")
      .then(setTechs)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const job = await api<RepairJob>("/api/repairs", {
        body: {
          ...f,
          customerId: party?._id,
          accessories: acc,
          estimate: f.estimate === "" ? undefined : Number(f.estimate),
          warrantyDays: f.warrantyDays === "" ? undefined : Number(f.warrantyDays),
          advance: Number(f.advance) || 0,
          technicianId: f.technicianId || undefined,
          warrantyOf: f.warrantyOf || undefined,
          imei: f.imei || undefined,
        },
      });
      toast.success(`${job.jobNo} booked`);
      onSaved(job);
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
      title="New repair job"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-repair" loading={saving}>Book in & print slip</Button>
        </>
      }
    >
      <form id="new-repair" onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          {party ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Customer khata: <b>{party.name}</b>
              <button type="button" onClick={() => setParty(null)} aria-label="Unlink customer">
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setPick(true)}>
              Choose a khata customer (optional)
            </Button>
          )}
        </div>
        <Field label="Customer name *">
          <Input required minLength={2} value={f.customerName} onChange={set("customerName")} aria-label="Customer name" />
        </Field>
        <Field label="Mobile number *" hint="For the WhatsApp message when it is ready">
          <Input required inputMode="tel" value={f.customerPhone} onChange={set("customerPhone")} placeholder="03xx xxxxxxx" aria-label="Customer mobile" />
        </Field>
        <Field label="Phone model *">
          <Input required minLength={2} value={f.deviceName} onChange={set("deviceName")} placeholder="e.g. Redmi Note 12" aria-label="Phone model" />
        </Field>
        <Field label="IMEI (optional)">
          <Input value={f.imei} onChange={set("imei")} className="font-mono" aria-label="IMEI" />
        </Field>
        <Field label="Colour">
          <Input value={f.color} onChange={set("color")} aria-label="Colour" />
        </Field>
        <Field label="Screen lock / pattern" hint="Only if needed for testing">
          <Input value={f.lockCode} onChange={set("lockCode")} aria-label="Screen lock" />
        </Field>
        <Field label="What is wrong *" className="sm:col-span-2 lg:col-span-3">
          <Textarea required minLength={3} value={f.problem} onChange={set("problem")} placeholder="e.g. Screen broken, touch not working" className="min-h-[60px]" aria-label="Problem" />
        </Field>
        <Field label="Condition when received" className="sm:col-span-2">
          <Input value={f.conditionNotes} onChange={set("conditionNotes")} placeholder="Scratches, cracked back, water damage…" aria-label="Condition" />
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">Received with</div>
          <div className="flex flex-wrap gap-1.5">
            {REPAIR_ACCESSORIES.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                <input type="checkbox" checked={acc.includes(a)} onChange={(e) => setAcc(e.target.checked ? [...acc, a] : acc.filter((x) => x !== a))} className="h-3.5 w-3.5 accent-brand-600" />
                {a}
              </label>
            ))}
          </div>
        </div>
        <Field label="Estimate (Rs)">
          <Input type="number" min="0" value={f.estimate} onChange={set("estimate")} aria-label="Estimate" />
        </Field>
        <Field label="Ready by">
          <Input type="date" value={f.promisedAt} onChange={set("promisedAt")} aria-label="Ready by" />
        </Field>
        <Field label="Technician">
          <Select value={f.technicianId} onChange={set("technicianId")} aria-label="Technician">
            <option value="">Not assigned</option>
            {techs.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Advance (Rs)">
          <Input type="number" min="0" value={f.advance} onChange={set("advance")} aria-label="Advance" />
        </Field>
        <Field label="Advance paid by">
          <Select value={f.advanceMethod} onChange={set("advanceMethod")} aria-label="Advance method">
            <option value="cash">Cash</option>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
          </Select>
        </Field>
        <Field label="Repair warranty (days)">
          <Input type="number" min="0" max="365" value={f.warrantyDays} onChange={set("warrantyDays")} aria-label="Warranty days" />
        </Field>
        <Field label="Warranty claim of job no. (optional)" hint="Free re-repair of an earlier job">
          <Input value={f.warrantyOf} onChange={set("warrantyOf")} placeholder="JOB-000123" aria-label="Warranty of job" />
        </Field>
      </form>
      <CustomerPicker
        open={pick}
        onClose={() => setPick(false)}
        onPick={(p) => {
          setParty(p);
          setF((x) => ({ ...x, customerName: x.customerName || p.name, customerPhone: x.customerPhone || p.phone || "" }));
          setPick(false);
        }}
      />
    </Modal>
  );
}
