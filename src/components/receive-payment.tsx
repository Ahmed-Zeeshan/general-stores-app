"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, Printer, Search, UserRound } from "lucide-react";
import { Button, Field, Input, Modal, Select, Spinner, cn } from "./ui";
import { useSession } from "./session";
import { useToast } from "./toast";
import { api, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR, round2 } from "@/lib/money";
import { openWhatsApp, paymentMessage, waNumber } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n";

export type PayParty = { _id: string; type: "customer" | "supplier"; name: string; phone?: string; balance: number };
type Saved = { _id: string; refNo?: string; amount: number; balanceAfter: number; method?: string; createdAt: string };

/** Opens the printable receipt (customer) or voucher (supplier) for a khata payment. */
export function printPaymentReceipt(entryId: string) {
  window.open(`/receipt/payment/${entryId}?print=1`, "_blank");
}

/** WhatsApp confirmation to the customer after they pay udhaar. */
export function sendPaymentWhatsApp(
  settings: { waPaymentTemplate?: string; shopName?: string; phone?: string } | null | undefined,
  party: { name: string; phone?: string },
  entry: { refNo?: string; amount: number; balanceAfter: number; method?: string; createdAt: string },
) {
  const wa = waNumber(party.phone);
  if (!wa) return false;
  openWhatsApp(
    wa,
    paymentMessage(settings?.waPaymentTemplate, {
      name: party.name,
      amount: Math.abs(entry.amount),
      balance: entry.balanceAfter,
      receiptNo: entry.refNo,
      date: entry.createdAt,
      method: entry.method,
      shop: settings?.shopName ?? "",
      shopPhone: settings?.phone,
    }),
  );
  return true;
}

/**
 * Receive udhaar from a customer (full or part) or pay a supplier. Without `party` it first asks
 * which customer is paying (used from the POS). Ends with print / WhatsApp for the receipt.
 */
export function ReceivePaymentModal({ open, party: given, onClose, onSaved }: { open: boolean; party?: PayParty | null; onClose: () => void; onSaved?: () => void }) {
  const toast = useToast();
  const t = useT();
  const { settings } = useSession();
  const [party, setParty] = useState<PayParty | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Saved | null>(null);
  // Reset only when the window opens, not when the parent reloads the khata after saving.
  const givenRef = useRef(given);
  givenRef.current = given;

  useEffect(() => {
    if (!open) return;
    setParty(givenRef.current ?? null);
    setAmount("");
    setMethod("cash");
    setNote("");
    setDone(null);
  }, [open]);

  if (!open) return null;
  const isCustomer = (party?.type ?? "customer") === "customer";
  const title = isCustomer ? t("Receive payment") : "Pay supplier";

  if (!party) return <PickCustomer onClose={onClose} onPick={setParty} />;

  const due = round2(party.balance);
  const paid = round2(Number(amount) || 0);
  const after = round2(due - paid);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!party || !(paid > 0)) return;
    setSaving(true);
    try {
      const entry = await api<Saved>(`/api/parties/${party._id}/payment`, { body: { type: "payment", amount: paid, method, note: note || undefined } });
      setDone(entry);
      onSaved?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const left = done.balanceAfter;
    const canWa = isCustomer && !!waNumber(party.phone);
    return (
      <Modal open onClose={onClose} title={isCustomer ? t("Payment received") : "Payment saved"} size="sm">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-brand-500" />
          <p className="mt-2 text-sm text-slate-500">
            {done.refNo} · {party.name}
          </p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{formatPKR(Math.abs(done.amount))}</p>
          <p className="text-sm text-slate-500">{PAYMENT_LABELS[done.method ?? "cash"]}</p>
          <div className={cn("mt-4 rounded-2xl p-3 text-sm font-semibold", left > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
            {left > 0
              ? isCustomer
                ? t("Still to collect: {amount}", { amount: formatPKR(left) })
                : `Still to pay: ${formatPKR(left)}`
              : left < 0
                ? `Advance: ${formatPKR(-left)}`
                : isCustomer
                  ? t("Khata clear — fully paid ✓")
                  : "Supplier fully paid ✓"}
          </div>
          <div className={cn("mt-6 grid gap-3", canWa ? "grid-cols-3" : "grid-cols-2")}>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => printPaymentReceipt(done._id)}>
              {isCustomer ? t("Receipt") : "Voucher"}
            </Button>
            {canWa && (
              <Button
                variant="outline"
                icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}
                onClick={() => {
                  sendPaymentWhatsApp(settings, party, done);
                  toast.success("WhatsApp opened — press Send there");
                }}
              >
                WhatsApp
              </Button>
            )}
            <Button onClick={onClose}>{t("Done")}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{party.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-800">{party.name}</div>
            <div className="text-xs text-slate-500">{party.phone || "No phone"}</div>
          </div>
          <div className="text-right">
            <div className={cn("font-bold", due > 0 ? "text-amber-700" : "text-emerald-700")}>{formatPKR(Math.abs(due))}</div>
            <div className="text-xs text-slate-400">{due > 0 ? (isCustomer ? "udhaar" : "to pay") : due < 0 ? "advance" : "clear"}</div>
          </div>
        </div>

        {due > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <QuickAmount label={t("Full payment")} value={due} active={paid === due} onPick={setAmount} />
            {due >= 200 && <QuickAmount label={t("Half")} value={roundNice(due / 2)} active={paid === roundNice(due / 2)} onPick={setAmount} />}
          </div>
        )}
        <Field label={t("Amount (Rs)")}>
          <Input autoFocus required type="number" inputMode="decimal" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 text-2xl font-bold" aria-label="Amount" />
        </Field>
        <Field label={isCustomer ? t("Paid by") : "Paid with"}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "jazzcash", "easypaisa", "bank", "card"].map((m) => (
              <option key={m} value={m}>{t(PAYMENT_LABELS[m])}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("Note (optional)")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>

        {paid > 0 && (
          <div className="rounded-2xl border border-slate-200 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Before</span><b>{formatPKR(due)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">{isCustomer ? "Received" : "Paid"}</span><b className="text-emerald-700">−{formatPKR(paid)}</b></div>
            <div className="mt-1.5 flex justify-between border-t border-dashed border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-700">{after > 0 ? "Remaining" : after < 0 ? "Advance (extra paid)" : "Remaining"}</span>
              <b className={after > 0 ? "text-amber-700" : "text-emerald-700"}>{formatPKR(Math.abs(after))}</b>
            </div>
            {after > 0 && due > 0 && <p className="mt-2 text-xs font-semibold text-amber-700">Part payment — {formatPKR(after)} will stay in the khata.</p>}
            {after === 0 && <p className="mt-2 text-xs font-semibold text-emerald-700">Full payment — khata will be clear.</p>}
            {after < 0 && <p className="mt-2 text-xs font-semibold text-sky-700">{formatPKR(-after)} more than due — it will be kept as advance.</p>}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={saving} disabled={!(paid > 0)}>
          {isCustomer ? t("Receive {amount}", { amount: paid > 0 ? formatPKR(paid) : "" }).trim() : `Pay ${paid > 0 ? formatPKR(paid) : ""}`}
        </Button>
      </form>
    </Modal>
  );
}

function roundNice(n: number) {
  return n >= 100 ? Math.round(n / 10) * 10 : round2(n);
}

function QuickAmount({ label, value, active, onPick }: { label: string; value: number; active: boolean; onPick: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(String(value))}
      className={cn(
        "rounded-xl border px-3 py-2 text-left transition",
        active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="font-bold text-slate-900">{formatPKR(value)}</div>
    </button>
  );
}

/** Customer search for receiving a payment from the POS. */
function PickCustomer({ onClose, onPick }: { onClose: () => void; onPick: (p: PayParty) => void }) {
  const toast = useToast();
  const t = useT();
  const [q, setQ] = useState("");
  const [list, setList] = useState<PayParty[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<PayParty[]>(`/api/parties?type=customer&q=${encodeURIComponent(q)}${q ? "" : "&due=1"}`)
        .then(setList)
        .catch((e) => toast.error(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, toast]);

  return (
    <Modal open onClose={onClose} title={t("Receive udhaar — choose customer")} size="sm">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Name or phone")} className="pl-10" aria-label="Search customer" />
      </div>
      <p className="mt-2 text-xs text-slate-500">{q ? "Matching customers" : "Customers with udhaar"}</p>
      <div className="mt-2 max-h-[50vh] overflow-y-auto">
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{q ? "No customer found." : "No customer has udhaar right now."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {list.map((p) => (
              <li key={p._id}>
                <button type="button" onClick={() => onPick({ ...p, type: "customer" })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                  <UserRound className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.phone || "No phone"}</div>
                  </div>
                  <div className={cn("font-bold", p.balance > 0 ? "text-amber-700" : "text-slate-400")}>{formatPKR(Math.abs(p.balance))}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
