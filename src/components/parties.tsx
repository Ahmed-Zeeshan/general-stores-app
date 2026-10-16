"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Ban, BookOpen, FileText, HandCoins, MessageCircle, Pencil, Phone, Plus, Printer, Search, Truck, UserRound, X } from "lucide-react";
import { Badge, Button, Card, Count, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, StatCard, Table, Td, Th, Textarea } from "./ui";
import { useCan, useSession } from "./session";
import { useConfirm } from "./confirm";
import { CustomerTabs } from "./customer-overview";
import { printPaymentReceipt, ReceivePaymentModal, sendPaymentWhatsApp } from "./receive-payment";
import { useToast } from "./toast";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";
import { checkPartyPhone, PHONE_HINT } from "@/lib/phone";
import { openWhatsApp, reminderMessage, waNumber } from "@/lib/whatsapp";

type PartyType = "customer" | "supplier";
type Party = { _id: string; type: PartyType; name: string; phone?: string; address?: string; creditLimit: number; balance: number; notes?: string; updatedAt: string; priceLevel?: "retail" | "wholesale"; points?: number };
type PointsRow = { _id: string; kind: "earn" | "redeem" | "return" | "adjust"; points: number; balanceAfter: number; refNo?: string; createdAt: string };
type Entry = {
  _id: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  method?: string;
  refType?: string;
  refNo?: string;
  note?: string;
  createdAt: string;
  user?: { name: string };
  reversed?: boolean;
};

const TEXT = {
  customer: {
    title: "Customers Khata",
    urdu: "گاہکوں کا کھاتہ",
    singular: "customer",
    add: "Add customer",
    total: "Total customers",
    one: "{n} customer",
    many: "{n} customers",
    empty: "No customers yet",
    emptyText: "Add regular customers to keep track of their udhaar.",
    noMatch: "No customers match your search",
    owesLabel: "Udhaar to collect",
    oweHint: "Customer owes you",
    payLabel: "Receive payment",
    chargeLabel: "Add udhaar",
    base: "/customers",
    icon: BookOpen,
  },
  supplier: {
    title: "Suppliers",
    urdu: "سپلائرز",
    singular: "supplier",
    add: "Add supplier",
    total: "Total suppliers",
    one: "{n} supplier",
    many: "{n} suppliers",
    empty: "No suppliers yet",
    emptyText: "Add the companies and dealers you buy stock from.",
    noMatch: "No suppliers match your search",
    owesLabel: "You need to pay",
    oweHint: "You owe this supplier",
    payLabel: "Pay supplier",
    chargeLabel: "Add bill amount",
    base: "/suppliers",
    icon: Truck,
  },
};


type Summary = { count: number; dueCount: number; dueTotal: number };

export function PartiesList({ type }: { type: PartyType }) {
  const t = TEXT[type];
  const tr = useT();
  const toast = useToast();
  const params = useSearchParams();
  const [list, setList] = useState<Party[] | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "due">(params.get("due") ? "due" : "all");
  const [adding, setAdding] = useState(params.get("new") === "1");

  // Shop-wide totals for the cards: never affected by the search or the "has udhaar" filter.
  const [summary, setSummary] = useState<Summary | null>(null);
  const loadSummary = useCallback(() => {
    api<Summary>(`/api/parties?type=${type}&summary=1`)
      .then(setSummary)
      .catch(() => {});
  }, [type]);
  useEffect(loadSummary, [loadSummary]);

  const load = useCallback(() => {
    api<Party[]>(`/api/parties?type=${type}&q=${encodeURIComponent(q)}${show === "due" ? "&due=1" : ""}`)
      .then(setList)
      .catch((e) => toast.error(e.message));
  }, [type, q, show, toast]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const filtered = !!q.trim() || show === "due";
  const clearSearch = () => {
    setQ("");
    setShow("all");
  };

  return (
    <div>
      <PageHeader
        title={t.title}
        urdu={t.urdu}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            {t.add}
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t.owesLabel}
          value={summary ? formatPKR(summary.dueTotal) : "—"}
          icon={<HandCoins className="h-5 w-5" />}
          tone={type === "customer" ? "amber" : "rose"}
          hint={summary ? <Count n={summary.dueCount} one={t.one} many={t.many} /> : undefined}
        />
        <StatCard label={t.total} value={summary?.count ?? "—"} icon={<t.icon className="h-5 w-5" />} tone="blue" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search by name or phone")} aria-label={tr("Search by name or phone")} className="pl-10" />
          </div>
          <Segmented
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All" },
              { value: "due", label: type === "customer" ? "Has udhaar" : "To pay" },
            ]}
          />
        </div>
        {!list ? (
          <Spinner />
        ) : list.length === 0 && filtered && (summary?.count ?? 1) > 0 ? (
          // There are customers, just none that match.
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            title={t.noMatch}
            text={q.trim() ? tr("Nothing found for “{q}”.", { q: q.trim() }) : undefined}
            action={<Button variant="outline" icon={<X className="h-4 w-4" />} onClick={clearSearch}>Clear search</Button>}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<t.icon className="h-8 w-8" />}
            title={t.empty}
            text={t.emptyText}
            action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>{t.add}</Button>}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((p) => (
              <li key={p._id}>
                <Link href={`${t.base}/${p._id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-slate-50">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-100 to-brand-200 font-bold text-brand-800">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-slate-800">{p.name}</span>
                      {p.priceLevel === "wholesale" && <Badge color="violet">Wholesale</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">{p.phone || tr("No phone")}</div>
                  </div>
                  <div className="text-right">
                    <div className={p.balance > 0 ? "font-bold text-amber-700" : p.balance < 0 ? "font-bold text-sky-700" : "font-semibold text-slate-400"}>
                      {formatPKR(Math.abs(p.balance))}
                    </div>
                    <div className="text-xs text-slate-400">{tr(p.balance > 0 ? (type === "customer" ? "will give" : "to pay") : p.balance < 0 ? "advance" : "clear")}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PartyForm
        type={type}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(saved) => {
          setAdding(false);
          // Show the new customer straight away (no waiting for the list to reload).
          if (saved && !filtered) setList((l) => [saved, ...(l ?? []).filter((x) => x._id !== saved._id)]);
          load();
          loadSummary();
        }}
      />
    </div>
  );
}

function PartyForm({ type, open, party, onClose, onSaved }: { type: PartyType; open: boolean; party?: Party; onClose: () => void; onSaved: (saved?: Party) => void }) {
  const toast = useToast();
  const can = useCan();
  const [form, setForm] = useState({ name: "", phone: "", address: "", creditLimit: "", notes: "", openingBalance: "", priceLevel: "retail" });
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const tr = useT();
  useEffect(() => {
    if (open) setPhoneError("");
    if (open)
      setForm({
        name: party?.name ?? "",
        phone: party?.phone ?? "",
        address: party?.address ?? "",
        creditLimit: party?.creditLimit ? String(party.creditLimit) : "",
        notes: party?.notes ?? "",
        openingBalance: "",
        priceLevel: party?.priceLevel ?? "retail",
      });
  }, [open, party]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    // Checked here first (instant), and again by the server.
    const phone = checkPartyPhone(type, form.phone);
    if (phone.error) {
      setPhoneError(phone.error);
      return;
    }
    setSaving(true);
    try {
      const { priceLevel, ...rest } = form;
      const level = type === "customer" ? { priceLevel } : {};
      const body = { ...rest, phone: phone.phone ?? "", ...level, creditLimit: Number(form.creditLimit) || 0 };
      const saved = party
        ? await api<Party>(`/api/parties/${party._id}`, { method: "PUT", body })
        : await api<Party>("/api/parties", { body: { type, ...body, openingBalance: Number(form.openingBalance) || 0 } });
      toast.success(tr("Saved"));
      onSaved(saved);
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
      title={party ? "Edit details" : TEXT[type].add}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="party-form" loading={saving}>Save</Button>
        </>
      }
    >
      <form id="party-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2">
          <Input autoFocus required value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Phone" hint={type === "customer" ? "Used for WhatsApp reminders" : undefined} error={phoneError ? tr(phoneError) : undefined}>
          <Input
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => {
              setForm({ ...form, phone: e.target.value });
              setPhoneError("");
            }}
            onBlur={() => {
              const r = checkPartyPhone(type, form.phone);
              if (r.error) setPhoneError(r.error);
              else if (r.phone) setForm((f) => ({ ...f, phone: r.phone! }));
            }}
            placeholder="0300-1234567"
            aria-invalid={!!phoneError}
            title={tr(PHONE_HINT)}
          />
        </Field>
        {type === "customer" && can.manage && (
          <Field label="Udhaar limit" hint="0 = no limit">
            <Input type="number" inputMode="decimal" min="0" value={form.creditLimit} onChange={set("creditLimit")} placeholder="0" />
          </Field>
        )}
        {type === "customer" && can.manage && (
          <Field label="Prices" hint="Wholesale customers automatically get wholesale prices at the counter">
            <Select value={form.priceLevel} onChange={set("priceLevel")} aria-label="Price level">
              <option value="retail">{tr("Retail (normal prices)")}</option>
              <option value="wholesale">{tr("Wholesale")}</option>
            </Select>
          </Field>
        )}
        <Field label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={set("address")} />
        </Field>
        {!party && can.manage && (
          <Field label={type === "customer" ? "Old udhaar (if any)" : "Old amount you owe (if any)"} hint="From your paper register">
            <Input type="number" inputMode="decimal" value={form.openingBalance} onChange={set("openingBalance")} placeholder="0" />
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={set("notes")} className="min-h-[60px]" />
        </Field>
      </form>
    </Modal>
  );
}

export function PartyDetail({ type, id }: { type: PartyType; id: string }) {
  const t = TEXT[type];
  const tr = useT();
  const toast = useToast();
  const can = useCan();
  const confirm = useConfirm();
  const { settings } = useSession();
  const [data, setData] = useState<{ party: Party; ledger: Entry[]; points?: PointsRow[] } | null>(null);
  const [txn, setTxn] = useState<"payment" | "charge" | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<{ party: Party; ledger: Entry[]; points?: PointsRow[] }>(`/api/parties/${id}`).then(setData).catch((e) => toast.error(e.message));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const { party, ledger } = data;
  const wa = waNumber(party.phone);
  async function remind() {
    if (!wa) return;
    openWhatsApp(wa, reminderMessage(settings?.waTemplate, { name: party.name, amount: party.balance, shop: settings?.shopName ?? "", shopPhone: settings?.phone }));
    await api("/api/reminders", { body: { partyId: party._id, kind: "reminder" } }).catch(() => {});
    toast.success(tr("WhatsApp opened — press Send there"));
  }
  async function cancelPayment(e: Entry) {
    const ok = await confirm({
      title: tr("Cancel payment {no}?", { no: e.refNo ?? "" }),
      message: tr("Use this only if the payment was entered by mistake. The entry stays in the khata, marked as cancelled."),
      details: [
        { label: tr(type === "customer" ? "Received from" : "Paid to"), value: party.name },
        { label: tr("Amount"), value: formatPKR(-e.amount), strong: true },
        { label: tr("Date"), value: formatDate(e.createdAt, true) },
      ],
      points: [
        tr(type === "customer" ? "{amount} will be added back to the customer's udhaar." : "{amount} will be added back to the amount you owe.", { amount: formatPKR(-e.amount) }),
      ],
      tone: "danger",
      confirmLabel: tr("Cancel payment"),
      cancelLabel: tr("Keep it"),
    });
    if (!ok) return;
    try {
      await api(`/api/ledger/${e._id}/reverse`, { body: {} });
      toast.success(tr("Payment cancelled"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const canCharge = can.manage;
  const canPay = type === "customer" || can.manage;

  const KIND: Record<string, string> = {
    sale: "Bill (udhaar)",
    purchase: "Purchase",
    payment: type === "customer" ? "Payment received" : "Payment made",
    return: type === "customer" ? "Bill returned" : "Goods returned to supplier",
    opening: "Old balance",
    adjustment: type === "customer" ? "Udhaar added" : "Bill added",
    reversal: "Payment cancelled",
  };

  const khataCard = (
      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">{tr("Khata history")}</h2>
        </div>
        {ledger.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{tr("No entries yet.")}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Details</Th>
                <Th className="text-right">{type === "customer" ? "Udhaar (+)" : "Bill (+)"}</Th>
                <Th className="text-right">Paid (−)</Th>
                <Th className="text-right">Balance</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e._id}>
                  <Td className="text-slate-500">{formatDate(e.createdAt, true)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800">
                      <span className={e.reversed ? "line-through decoration-rose-400" : ""}>{tr(KIND[e.kind] ?? e.kind)}</span>
                      {e.reversed && <Badge color="red">Cancelled</Badge>}
                    </div>
                    <div className="text-xs text-slate-400">
                      {[
                        e.refNo,
                        e.method && PAYMENT_LABELS[e.method],
                        e.note && e.note !== `Bill ${e.refNo}` ? (e.refNo && e.note.startsWith(`${e.refNo} cancelled`) ? e.note.slice(e.refNo.length + 11).replace(/^ — /, "") || null : e.note) : null,
                        e.user?.name && tr("by {name}", { name: e.user.name }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </Td>
                  <Td className="text-right font-semibold text-amber-700">{e.amount > 0 ? formatPKR(e.amount) : ""}</Td>
                  <Td className="text-right font-semibold text-emerald-700">{e.amount < 0 ? formatPKR(-e.amount) : ""}</Td>
                  <Td className="text-right font-bold text-slate-900">{formatPKR(e.balanceAfter)}</Td>
                  <Td className="text-right">
                    {e.kind === "payment" && e.refType === "payment" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title={tr(type === "customer" ? "Print receipt" : "Print voucher")} aria-label="Print receipt" icon={<Printer className="h-4 w-4" />} onClick={() => printPaymentReceipt(e._id)} />
                        {type === "customer" && wa && !e.reversed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={tr("Send payment confirmation on WhatsApp")}
                            aria-label="WhatsApp receipt"
                            icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}
                            onClick={() => {
                              sendPaymentWhatsApp(settings, party, e);
                              toast.success(tr("WhatsApp opened — press Send there"));
                            }}
                          />
                        )}
                        {can.manage && !e.reversed && (
                          <Button size="sm" variant="ghost" className="hover:text-rose-600" title={tr("Cancel this payment")} aria-label="Cancel payment" icon={<Ban className="h-4 w-4" />} onClick={() => cancelPayment(e)} />
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
  );
  const pointsCard = type === "customer" ? (
      <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-900">{tr("Loyalty points")}</h2>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Details</Th>
                <Th className="text-right">Points</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {data.points!.map((p) => (
                <tr key={p._id}>
                  <Td className="text-slate-500">{formatDate(p.createdAt, true)}</Td>
                  <Td>
                    {tr({ earn: "Earned on bill", redeem: "Spent on bill", return: "Taken back (return)", adjust: "Adjusted" }[p.kind])} {p.refNo && <span className="text-xs text-slate-400">{p.refNo}</span>}
                  </Td>
                  <Td className={`text-right font-semibold ${p.points > 0 ? "text-emerald-700" : "text-rose-600"}`}>{p.points > 0 ? `+${p.points}` : p.points}</Td>
                  <Td className="text-right font-bold">{p.balanceAfter}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
  ) : null;

  return (
    <div>
      <Link href={t.base} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {tr("Back to {name}", { name: tr(t.title) })}
      </Link>

      <Card className="overflow-hidden">
        <div className="bg-linear-to-br from-slate-800 to-slate-900 p-6 text-white">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                <UserRound className="h-7 w-7" />
              </div>
              <div>
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                  {party.name}
                  {party.priceLevel === "wholesale" && <span className="rounded-full bg-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-100">{tr("Wholesale")}</span>}
                </h1>
                <div className="mt-0.5 flex flex-wrap gap-3 text-sm text-slate-300">
                  {party.phone && (
                    <a href={`tel:${party.phone}`} className="inline-flex items-center gap-1 hover:text-white">
                      <Phone className="h-3.5 w-3.5" /> {party.phone}
                    </a>
                  )}
                  {party.address && <span>{party.address}</span>}
                </div>
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-sm text-slate-300">{tr(party.balance >= 0 ? t.oweHint : "Advance / extra paid")}</div>
              <div className={`text-4xl font-extrabold ${party.balance > 0 ? "text-amber-300" : "text-emerald-300"}`}>{formatPKR(Math.abs(party.balance))}</div>
              {party.creditLimit > 0 && <div className="text-xs text-slate-400">{tr("Limit: {amount}", { amount: formatPKR(party.creditLimit) })}</div>}
              {type === "customer" && settings?.loyaltyEnabled && (
                <div className="mt-1 text-sm font-semibold text-violet-200">
                  {tr("{points} loyalty points · worth {amount}", { points: party.points ?? 0, amount: formatPKR((party.points ?? 0) * (settings.loyaltyPointValue ?? 1)) })}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {canPay && (
            <Button icon={<HandCoins className="h-4 w-4" />} onClick={() => setTxn("payment")}>
              {t.payLabel}
            </Button>
          )}
          {canCharge && (
            <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setTxn("charge")}>
              {t.chargeLabel}
            </Button>
          )}
          {type === "customer" && wa && party.balance > 0 && (
            <Button variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={remind}>
              WhatsApp reminder
            </Button>
          )}
          <a href={`/statement/${party._id}`} target="_blank" rel="noreferrer">
            <Button variant="outline" icon={<FileText className="h-4 w-4" />}>Statement</Button>
          </a>
          {can.manage && (
            <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </Card>

      {type === "customer" ? (
        <CustomerTabs id={party._id} khata={khataCard} points={(data.points?.length ?? 0) > 0 ? pointsCard : null} />
      ) : (
        <div className="mt-6">{khataCard}</div>
      )}

      <ReceivePaymentModal open={txn === "payment"} party={party} onClose={() => setTxn(null)} onSaved={load} />
      <TxnModal type={type} mode={txn === "charge" ? "charge" : null} party={party} onClose={() => setTxn(null)} onSaved={() => { setTxn(null); load(); }} />
      <PartyForm type={type} open={editing} party={party} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
    </div>
  );
}

/** Manual udhaar / supplier bill added to the khata (payments use ReceivePaymentModal). */
function TxnModal({ type, mode, party, onClose, onSaved }: { type: PartyType; mode: "charge" | null; party: Party; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const tr = useT();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAmount("");
    setNote("");
  }, [mode]);
  if (!mode) return null;
  const t = TEXT[type];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/parties/${party._id}/payment`, { body: { type: "charge", amount: Number(amount), note } });
      toast.success(tr("Khata updated"));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t.chargeLabel} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Amount (Rs)">
          <Input autoFocus required type="number" inputMode="decimal" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 text-2xl font-bold" />
        </Field>
        <Field label="Note (optional)" hint={type === "customer" ? "e.g. items taken without a bill" : "e.g. supplier bill number"}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={saving}>
          Save
        </Button>
      </form>
    </Modal>
  );
}
