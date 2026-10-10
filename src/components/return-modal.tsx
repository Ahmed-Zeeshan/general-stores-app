"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Minus, Plus, Printer, RotateCcw } from "lucide-react";
import { Button, Field, Input, Modal, Select, Spinner, cn } from "./ui";
import { useToast } from "./toast";
import { api, formatDate, PAYMENT_LABELS, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty, round2 } from "@/lib/money";

export type ReturnableSale = {
  _id: string;
  invoiceNo: string;
  createdAt: string;
  customer?: string;
  customerName?: string;
  paymentMethod: string;
  payments?: { method: string; amount: number }[];
  items: { name: string; unit: string; qty: number; price: number; total: number; returnedQty?: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  creditAmount: number;
  creditReturned?: number;
  returnedTotal?: number;
  status: string;
};

const REASONS = ["Damaged / broken", "Expired", "Wrong item given", "Customer changed mind", "Quality problem", "Other"];
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Return some or all items of a bill, with udhaar handled first and the refund method chosen. */
export function ReturnModal({ sale: given, onClose, onDone }: { sale: ReturnableSale | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  // Always work on the latest copy of the bill (the list on screen may not have refreshed yet).
  const [sale, setSale] = useState<ReturnableSale | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [qty, setQty] = useState<Record<number, string>>({});
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ _id: string; returnNo: string; total: number; refund: number; creditReduced: number; refundMethod: string } | null>(null);

  useEffect(() => {
    setSale(null);
    if (!given) return;
    setQty({});
    setReason("");
    setNote("");
    setDone(null);
    let alive = true;
    api<ReturnableSale>(`/api/sales/${given._id}`)
      .then((fresh) => {
        if (!alive) return;
        const split = new Set((fresh.payments ?? []).map((p) => p.method)).size > 1;
        setMethod(!split && ["card", "jazzcash", "easypaisa", "bank"].includes(fresh.paymentMethod) ? fresh.paymentMethod : "cash");
        setSale(fresh);
      })
      .catch((e) => {
        toast.error(e.message);
        closeRef.current();
      });
    return () => {
      alive = false;
    };
  }, [given, toast]);

  const lines = useMemo(() => {
    if (!sale) return [];
    return sale.items.map((it, index) => {
      const left = round3(it.qty - (it.returnedQty ?? 0));
      const q = Math.min(left, Math.max(0, Number(qty[index]) || 0));
      return { ...it, index, left, q, value: it.qty ? (it.total * q) / it.qty : 0 };
    });
  }, [sale, qty]);

  if (!given) return null;
  if (!sale) {
    return (
      <Modal open onClose={onClose} title={`Return items — ${given.invoiceNo}`} size="lg">
        <Spinner />
      </Modal>
    );
  }
  if (sale.status === "returned" && !done) {
    return (
      <Modal open onClose={onClose} title={`Return items — ${sale.invoiceNo}`} size="sm">
        <p className="py-6 text-center text-sm text-slate-500">This bill has already been fully returned.</p>
        <Button className="w-full" onClick={onClose}>Close</Button>
      </Modal>
    );
  }
  const chosen = lines.filter((l) => l.q > 0);
  const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 0;
  const remainingValue = round2(sale.total - (sale.returnedTotal ?? 0));
  const allChosen = lines.every((l) => l.left <= 0 || Math.abs(l.q - l.left) < 0.0005);
  const value = chosen.length ? (allChosen ? remainingValue : Math.min(remainingValue, round2(chosen.reduce((s, l) => s + l.value, 0) * ratio))) : 0;
  const creditLeft = round2(sale.creditAmount - (sale.creditReturned ?? 0));
  const creditReduced = round2(Math.min(value, Math.max(0, creditLeft)));
  const refund = round2(value - creditReduced);

  const setLine = (i: number, v: number, left: number) => setQty({ ...qty, [i]: String(Math.max(0, Math.min(left, round3(v)))) });
  const selectAll = () => setQty(Object.fromEntries(lines.map((l) => [l.index, String(l.left)])));

  async function submit() {
    if (!sale) return;
    setSaving(true);
    try {
      const r = await api<{ return: NonNullable<typeof done> }>(`/api/sales/${sale._id}/return`, {
        body: {
          items: chosen.map((l) => ({ index: l.index, qty: l.q })),
          refundMethod: refund > 0 ? method : undefined,
          reason: [reason, note].filter(Boolean).join(" — ") || undefined,
        },
      });
      setDone(r.return);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Return saved" size="sm">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-brand-500" />
          <p className="mt-2 text-sm text-slate-500">{done.returnNo} · bill {sale.invoiceNo}</p>
          {done.creditReduced > 0 && <p className="mt-3 text-sm text-slate-600">Udhaar reduced by <b>{formatPKR(done.creditReduced)}</b></p>}
          {done.refund > 0 ? (
            <div className="mt-4 rounded-2xl bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                {done.refundMethod === "khata" ? "Added to customer's khata as credit" : `Give back to customer (${PAYMENT_LABELS[done.refundMethod] ?? done.refundMethod})`}
              </p>
              <p className="text-3xl font-extrabold text-amber-900">{formatPKR(done.refund)}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No money to give back.</p>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.open(`/receipt/return/${done._id}?print=1`, "_blank")}>
              Print
            </Button>
            <Button size="lg" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Return items — ${sale.invoiceNo}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={saving} disabled={!chosen.length} icon={<RotateCcw className="h-4 w-4" />} onClick={submit}>
            {refund > 0 && method !== "khata" ? `Return & refund ${formatPKR(refund)}` : "Save return"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>
          {formatDate(sale.createdAt, true)} · {sale.customerName ?? "Walk-in"} · {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod} · {formatPKR(sale.total)}
        </span>
        <Button size="sm" variant="secondary" onClick={selectAll}>Return everything</Button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {lines.map((l) => (
          <li key={l.index} className={cn("flex items-center gap-3 px-4 py-3", l.left <= 0 && "opacity-50")}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-slate-800">{l.name}</div>
              <div className="text-xs text-slate-500">
                Sold {formatQty(l.qty)} {UNIT_LABELS[l.unit] ?? l.unit} × {formatPKR(l.price)}
                {(l.returnedQty ?? 0) > 0 && <span className="text-rose-600"> · {formatQty(l.returnedQty!)} already returned</span>}
              </div>
            </div>
            {l.left > 0 ? (
              <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                <button type="button" className="flex h-9 w-9 items-center justify-center text-slate-600" onClick={() => setLine(l.index, l.q - 1, l.left)} aria-label="Less">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={l.left}
                  step="any"
                  value={qty[l.index] ?? ""}
                  placeholder="0"
                  onChange={(e) => setQty({ ...qty, [l.index]: e.target.value })}
                  aria-label={`Quantity of ${l.name} to return`}
                  className="h-9 w-16 border-x border-slate-200 text-center font-semibold focus:outline-hidden"
                />
                <button type="button" className="flex h-9 w-9 items-center justify-center text-slate-600" onClick={() => setLine(l.index, l.q + 1, l.left)} aria-label="More">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <span className="text-xs font-semibold text-rose-600">Fully returned</span>
            )}
            <span className="w-24 text-right text-sm font-semibold text-slate-800">{l.q ? formatPKR(l.value * ratio) : "—"}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason (optional)</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Value of returned items</span><b>{formatPKR(value)}</b></div>
        {creditLeft > 0 && (
          <div className="mt-1.5 flex justify-between">
            <span className="text-slate-500">Taken off this bill&apos;s udhaar</span>
            <b className="text-emerald-700">{formatPKR(creditReduced)}</b>
          </div>
        )}
        {refund > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold text-slate-800">Give back {formatPKR(refund)} by</span>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 sm:w-60">
              <option value="cash">Cash</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
              <option value="bank">Bank transfer</option>
              <option value="card">Card</option>
              {sale.customer && <option value="khata">Credit to khata (advance)</option>}
            </Select>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Returned items go back into stock. Discount and tax of the bill are shared fairly across the returned items.</p>
      </div>
    </Modal>
  );
}
