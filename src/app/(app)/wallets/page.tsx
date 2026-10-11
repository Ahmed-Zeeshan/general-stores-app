"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Ban, Gauge, Package2, Pencil, Plus, Printer, Scale, Search, Smartphone, Wallet as WalletIcon } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, StatCard, Table, Td, Textarea, Th, cn } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useCan } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR, round2 } from "@/lib/money";
import { OPERATORS, OPERATOR_LABELS, PACKAGE_KIND_LABELS, PROVIDER_LABELS, WALLET_KINDS, WALLET_PROVIDERS, WALLET_TXN_LABELS, type WalletTxnType } from "@/lib/constants";

type WalletRow = { _id: string; name: string; kind: "load" | "wallet" | "bank"; provider: string; number?: string; balance: number; lowAlert: number; commissionPct: number; feePct: number; active: boolean };
type PackageRow = { _id: string; operator: string; name: string; kind: string; data?: string; minutes?: string; sms?: string; validityDays?: number; price: number; commission?: number; code?: string; active: boolean };
type Txn = {
  _id: string;
  txnNo: string;
  type: WalletTxnType;
  walletName: string;
  amount: number;
  fee: number;
  commission: number;
  cashEffect: number;
  walletEffect: number;
  method: string;
  balanceAfter: number;
  customerNumber?: string;
  customerName?: string;
  packageName?: string;
  ref?: string;
  note?: string;
  reversed?: boolean;
  reverseReason?: string;
  userName?: string;
  createdAt: string;
};
type Day = { rows: Txn[]; summary: { count: number; profit: number; cashNet: number; byType: Record<string, { count: number; amount: number; profit: number }> } };

type EntryType = "load" | "package" | "cash_in" | "cash_out" | "bill";
const QUICK = [100, 200, 500, 1000];

export default function WalletsPage() {
  const toast = useToast();
  const can = useCan();
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [q, setQ] = useState("");
  const [day, setDay] = useState<Day | null>(null);
  const [editing, setEditing] = useState<WalletRow | "new" | null>(null);
  const [floatFor, setFloatFor] = useState<{ w: WalletRow; kind: "float_in" | "float_out" | "commission" } | null>(null);
  const [checking, setChecking] = useState<WalletRow | null>(null);
  const [cancelling, setCancelling] = useState<Txn | null>(null);

  const loadWallets = useCallback(() => {
    api<WalletRow[]>("/api/wallets")
      .then(setWallets)
      .catch((e) => toast.error(e.message));
  }, [toast]);
  const loadDay = useCallback(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (q.trim()) p.set("q", q.trim());
    api<Day>(`/api/wallet-txns?${p}`)
      .then(setDay)
      .catch((e) => toast.error(e.message));
  }, [range, q, toast]);
  useEffect(loadWallets, [loadWallets]);
  useEffect(() => {
    const t = setTimeout(loadDay, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadDay, q]);
  useEffect(() => {
    api<PackageRow[]>("/api/packages")
      .then(setPackages)
      .catch(() => {});
  }, []);
  const refresh = () => {
    loadWallets();
    loadDay();
  };

  const low = (wallets ?? []).filter((w) => w.lowAlert > 0 && w.balance < w.lowAlert);
  return (
    <div>
      <PageHeader
        title="Easyload & Wallets"
        urdu="ایزی لوڈ اور والٹ"
        subtitle="Easyload, internet & call packages, JazzCash / Easypaisa cash in & out, bill payments"
        actions={
          <>
            <Link href="/wallets/packages">
              <Button variant="outline" icon={<Package2 className="h-4 w-4" />}>Packages</Button>
            </Link>
            {can.manage && (
              <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
                Add SIM / account
              </Button>
            )}
          </>
        }
      />
      {low.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Low balance: {low.map((w) => `${w.name} (${formatPKR(w.balance)})`).join(", ")}. Top up soon.
          </span>
        </div>
      )}
      {!wallets ? (
        <Spinner />
      ) : wallets.length === 0 ? (
        <Card className="mb-6">
          <EmptyState
            icon={<Smartphone className="h-7 w-7" />}
            title="No SIMs or accounts yet"
            text={can.manage ? "Add your Easyload SIM (Jazz, Zong, Telenor, Ufone), JazzCash / Easypaisa retailer account and bank account with their current balance." : "Ask the owner to add the Easyload SIMs and wallet accounts."}
            action={can.manage ? <Button onClick={() => setEditing("new")} icon={<Plus className="h-4 w-4" />}>Add SIM / account</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {wallets.map((w) => {
            const isLow = w.lowAlert > 0 && w.balance < w.lowAlert;
            return (
              <Card key={w._id} className={cn("p-4", isLow && "border-amber-300")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{w.name}</div>
                    <div className="text-xs text-slate-500">
                      {PROVIDER_LABELS[w.provider] ?? w.provider}
                      {w.number && ` · ${w.number}`}
                    </div>
                  </div>
                  {isLow ? <Badge color="amber">Low</Badge> : <Badge color={w.kind === "load" ? "violet" : w.kind === "bank" ? "blue" : "green"}>{w.kind === "load" ? "Easyload" : w.kind === "bank" ? "Bank" : "Wallet"}</Badge>}
                </div>
                <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{formatPKR(w.balance)}</div>
                {can.manage && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={() => setFloatFor({ w, kind: "float_in" })}>
                      Top up
                    </Button>
                    <Button size="sm" variant="ghost" icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} onClick={() => setFloatFor({ w, kind: "float_out" })} aria-label={`Withdraw from ${w.name}`} />
                    <Button size="sm" variant="ghost" icon={<Scale className="h-3.5 w-3.5" />} onClick={() => setChecking(w)} aria-label={`Balance check ${w.name}`} />
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(w)} aria-label={`Edit ${w.name}`} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {wallets && wallets.length > 0 && <EntryPanel wallets={wallets} packages={packages} canManage={can.manage} onSaved={refresh} onCommission={(w) => setFloatFor({ w, kind: "commission" })} />}

      <div className="my-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Entries" value={day?.summary.count ?? "—"} icon={<Gauge className="h-5 w-5" />} hint={range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(range.to)}`} />
        <StatCard label="Profit (fees + commission)" value={day ? formatPKR(day.summary.profit) : "—"} icon={<WalletIcon className="h-5 w-5" />} tone="green" />
        <StatCard label="Cash into the drawer (net)" value={day ? formatPKR(day.summary.cashNet) : "—"} icon={<ArrowDownToLine className="h-5 w-5" />} tone="violet" hint="Cash received less cash paid out" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <div className="relative lg:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, name, TID, entry no." className="pl-9" aria-label="Search entries" />
          </div>
        </div>
        {!day ? (
          <Spinner />
        ) : day.rows.length === 0 ? (
          <EmptyState icon={<Gauge className="h-7 w-7" />} title="No entries" text="Easyload, packages and wallet entries appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Entry</Th>
                <Th>Type</Th>
                <Th>Customer</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Profit</Th>
                <Th className="text-right">Drawer</Th>
                <Th className="text-right">Balance after</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {day.rows.map((t) => (
                <tr key={t._id} className={cn(t.reversed && "opacity-60")}>
                  <Td>
                    <div className={cn("font-semibold text-slate-800", t.reversed && "line-through")}>{t.txnNo}</div>
                    <div className="text-xs text-slate-500">
                      {formatDate(t.createdAt, true)}
                      {t.userName && ` · ${t.userName}`}
                    </div>
                  </Td>
                  <Td>
                    <div>{WALLET_TXN_LABELS[t.type]}{t.packageName && `: ${t.packageName}`}</div>
                    <div className="text-xs text-slate-500">{t.walletName}</div>
                    {t.reversed && <Badge color="red">Cancelled</Badge>}
                  </Td>
                  <Td>
                    <div>{t.customerNumber ?? t.customerName ?? "—"}</div>
                    {(t.ref || t.note) && <div className="max-w-[220px] truncate text-xs text-slate-500">{[t.ref, t.note].filter(Boolean).join(" · ")}</div>}
                  </Td>
                  <Td className="text-right font-semibold">{formatPKR(t.amount)}</Td>
                  <Td className="text-right text-emerald-700">{t.fee + t.commission ? formatPKR(round2(t.fee + t.commission)) : "—"}</Td>
                  <Td className={cn("text-right", t.cashEffect < 0 && "text-rose-600")}>{t.cashEffect ? formatPKR(t.cashEffect) : "—"}</Td>
                  <Td className="text-right text-slate-500">{formatPKR(t.balanceAfter)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/wallet/${t._id}?print=1`, "_blank")} aria-label={`Print ${t.txnNo}`} />
                      {can.manage && !t.reversed && t.type !== "reversal" && (
                        <Button size="sm" variant="ghost" className="hover:text-rose-600" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(t)} aria-label={`Cancel ${t.txnNo}`} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <WalletForm wallet={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      <FloatModal target={floatFor} onClose={() => setFloatFor(null)} onSaved={() => { setFloatFor(null); refresh(); }} />
      <CheckModal wallet={checking} onClose={() => setChecking(null)} onSaved={() => { setChecking(null); refresh(); }} />
      <CancelModal txn={cancelling} onClose={() => setCancelling(null)} onSaved={() => { setCancelling(null); refresh(); }} />
    </div>
  );
}

/** The counter form: Easyload, package, cash in / out, bill. */
function EntryPanel({ wallets, packages, canManage, onSaved, onCommission }: { wallets: WalletRow[]; packages: PackageRow[]; canManage: boolean; onSaved: () => void; onCommission: (w: WalletRow) => void }) {
  const toast = useToast();
  const [type, setType] = useState<EntryType>("load");
  const forType = useMemo(() => wallets.filter((w) => (type === "load" || type === "package" ? w.kind === "load" : w.kind !== "load")), [wallets, type]);
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [method, setMethod] = useState("cash");
  const [pkg, setPkg] = useState<PackageRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<Txn | null>(null);
  useEffect(() => {
    if (!forType.find((w) => w._id === walletId)) setWalletId(forType[0]?._id ?? "");
    setPkg(null);
  }, [type, forType, walletId]);
  const w = wallets.find((x) => x._id === walletId);
  // Suggest the usual fee for cash in / out / bills.
  useEffect(() => {
    if (w && (type === "cash_in" || type === "cash_out" || type === "bill") && w.feePct > 0 && Number(amount) > 0) setFee(String(Math.round((Number(amount) * w.feePct) / 100)));
  }, [amount, type, w]);
  const operatorPkgs = packages.filter((p) => !w || p.operator === w.provider);
  const amt = type === "package" ? pkg?.price ?? 0 : Number(amount) || 0;
  const commission = type === "load" && w ? round2((amt * w.commissionPct) / 100) : type === "package" && pkg ? pkg.commission ?? round2((pkg.price * (w?.commissionPct ?? 0)) / 100) : 0;
  const feeN = Number(fee) || 0;
  const cashLine =
    type === "cash_out" ? `Give the customer ${formatPKR(Math.max(0, amt - feeN))}` : `Take from the customer ${formatPKR(amt + (type === "load" || type === "package" ? 0 : feeN))}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!w) return toast.error("Choose the SIM / account.");
    if (type === "package" && !pkg) return toast.error("Choose the package.");
    setSaving(true);
    try {
      const t = await api<Txn>("/api/wallet-txns", {
        body: {
          walletId,
          type,
          ...(type === "package" ? { packageId: pkg!._id } : { amount: amt }),
          fee: type === "load" || type === "package" ? 0 : feeN,
          method,
          customerNumber: number || undefined,
          customerName: name || undefined,
          ref: ref || undefined,
        },
      });
      toast.success(`${t.txnNo}: ${WALLET_TXN_LABELS[t.type]} ${formatPKR(t.amount)} saved`);
      setLast(t);
      setAmount("");
      setFee("");
      setNumber("");
      setName("");
      setRef("");
      setPkg(null);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: "load", label: "Easyload" },
          { value: "package", label: "Package" },
          { value: "cash_in", label: "Cash in / send" },
          { value: "cash_out", label: "Cash out" },
          { value: "bill", label: "Bill payment" },
        ]}
      />
      {forType.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {type === "load" || type === "package" ? "Add an Easyload SIM first (Add SIM / account → Easyload SIM)." : "Add a JazzCash / Easypaisa or bank account first."}
        </p>
      ) : (
        <form onSubmit={save} className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={type === "load" || type === "package" ? "SIM" : "Account"}>
              <Select value={walletId} onChange={(e) => setWalletId(e.target.value)} aria-label="Account">
                {forType.map((x) => (
                  <option key={x._id} value={x._id}>
                    {x.name} — {formatPKR(x.balance)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={type === "bill" ? "Consumer / reference no." : "Customer mobile number"}>
              <Input inputMode={type === "bill" ? "text" : "tel"} required={type === "load" || type === "package"} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={type === "bill" ? "e.g. 0412345678901" : "03xx xxxxxxx"} aria-label="Customer number" />
            </Field>
            {type === "package" ? (
              <div className="sm:col-span-2">
                <div className="mb-1.5 text-sm font-medium text-slate-700">Package</div>
                {operatorPkgs.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No {w ? OPERATOR_LABELS[w.provider] ?? "" : ""} packages yet. <Link href="/wallets/packages" className="font-semibold text-brand-700">Add packages</Link>
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {operatorPkgs.map((p) => (
                      <button
                        type="button"
                        key={p._id}
                        onClick={() => setPkg(p)}
                        className={cn("rounded-xl border p-3 text-left transition hover:border-brand-400", pkg?._id === p._id ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          <span className="whitespace-nowrap font-bold text-brand-700">{formatPKR(p.price)}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[p.data, p.minutes, p.sms, p.validityDays ? `${p.validityDays} days` : null].filter(Boolean).join(" · ") || PACKAGE_KIND_LABELS[p.kind]}
                        </div>
                        {p.code && <div className="mt-0.5 text-[11px] text-slate-400">{p.code}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <Field label="Amount (Rs)">
                  <Input required type="number" min="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-bold" aria-label="Amount" />
                </Field>
                {type === "load" ? (
                  <div className="flex items-end gap-2">
                    {QUICK.map((n) => (
                      <button key={n} type="button" onClick={() => setAmount(String(n))} className={cn("h-11 flex-1 rounded-xl border text-sm font-semibold", Number(amount) === n ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-brand-300")}>
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Field label={type === "cash_out" ? "Fee kept (Rs)" : "Fee charged (Rs)"} hint={w?.feePct ? `Usual: ${w.feePct}%` : undefined}>
                    <Input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Fee" />
                  </Field>
                )}
              </>
            )}
            {type !== "load" && type !== "package" && (
              <>
                <Field label={type === "bill" ? "Bill (e.g. LESCO, SNGPL, PTCL)" : "Customer name (optional)"}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Customer name" />
                </Field>
                <Field label="Transaction ID (TID)">
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Transaction ID" />
                </Field>
                <Field label={type === "cash_out" ? "Customer gets" : "Customer pays"}>
                  <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Customer pays by">
                    <option value="cash">Cash (drawer)</option>
                    <option value="bank">Bank / other account</option>
                  </Select>
                </Field>
              </>
            )}
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-2xl bg-slate-50 p-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{type === "cash_out" ? "Into account" : "From account"}</span>
                <b>{formatPKR(amt)}</b>
              </div>
              {(type === "load" || type === "package") && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Commission</span>
                  <b className="text-emerald-700">{formatPKR(commission)}</b>
                </div>
              )}
              {feeN > 0 && type !== "load" && type !== "package" && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee (profit)</span>
                  <b className="text-emerald-700">{formatPKR(feeN)}</b>
                </div>
              )}
              {method === "cash" && amt > 0 && <div className="rounded-xl bg-white p-2 text-center text-base font-bold text-slate-900">{cashLine}</div>}
              {w && <div className="text-xs text-slate-500">{w.name} balance after: {formatPKR(round2(w.balance + (type === "cash_out" ? amt : -amt)))}</div>}
            </div>
            <Button type="submit" size="lg" loading={saving} disabled={!w || (type === "package" ? !pkg : !(amt > 0))}>
              Save {WALLET_TXN_LABELS[type]}
            </Button>
            {last && (
              <button type="button" onClick={() => window.open(`/receipt/wallet/${last._id}?print=1`, "_blank")} className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-700">
                <Printer className="h-3.5 w-3.5" /> Print slip for {last.txnNo}
              </button>
            )}
            {canManage && w && (
              <button type="button" onClick={() => onCommission(w)} className="text-xs text-slate-500 hover:text-slate-700">
                Commission credited by {PROVIDER_LABELS[w.provider] ?? "the company"}? Record it
              </button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

function WalletForm({ wallet, onClose, onSaved }: { wallet: WalletRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = wallet === "new";
  const [f, setF] = useState({ name: "", kind: "load", provider: "jazz", number: "", lowAlert: "", commissionPct: "", feePct: "", openingBalance: "", active: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!wallet) return;
    if (wallet === "new") setF({ name: "", kind: "load", provider: "jazz", number: "", lowAlert: "", commissionPct: "", feePct: "", openingBalance: "", active: true });
    else setF({ name: wallet.name, kind: wallet.kind, provider: wallet.provider, number: wallet.number ?? "", lowAlert: String(wallet.lowAlert || ""), commissionPct: String(wallet.commissionPct || ""), feePct: String(wallet.feePct || ""), openingBalance: "", active: wallet.active });
  }, [wallet]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: f.name, number: f.number, lowAlert: Number(f.lowAlert) || 0, commissionPct: Number(f.commissionPct) || 0, feePct: Number(f.feePct) || 0 };
      if (isNew) await api("/api/wallets", { body: { ...body, kind: f.kind, provider: f.provider, openingBalance: Number(f.openingBalance) || 0 } });
      else await api(`/api/wallets/${(wallet as WalletRow)._id}`, { method: "PATCH", body: { ...body, active: f.active } });
      toast.success(isNew ? "Account added" : "Saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={!!wallet} onClose={onClose} title={isNew ? "Add SIM / account" : `Edit ${(wallet as WalletRow | null)?.name ?? ""}`} size="md">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <>
            <Field label="Type">
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, provider: e.target.value === "load" ? "jazz" : e.target.value === "bank" ? "bank" : "jazzcash" })} aria-label="Account type">
                {WALLET_KINDS.map((k) => (
                  <option key={k} value={k}>{k === "load" ? "Easyload / packages SIM" : k === "wallet" ? "Mobile wallet (JazzCash, Easypaisa…)" : "Bank account"}</option>
                ))}
              </Select>
            </Field>
            <Field label="Company">
              <Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} aria-label="Company">
                {(f.kind === "load" ? OPERATORS : f.kind === "bank" ? (["bank"] as const) : WALLET_PROVIDERS.filter((p) => !(OPERATORS as readonly string[]).includes(p) && p !== "bank")).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Name">
          <Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Jazz Easyload SIM" aria-label="Account name" />
        </Field>
        <Field label="SIM / account number">
          <Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} aria-label="Account number" />
        </Field>
        {isNew && (
          <Field label="Balance now (Rs)" hint="As shown on the SIM / app">
            <Input type="number" min="0" value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} aria-label="Opening balance" />
          </Field>
        )}
        <Field label="Warn below (Rs)">
          <Input type="number" min="0" value={f.lowAlert} onChange={(e) => setF({ ...f, lowAlert: e.target.value })} aria-label="Low balance alert" />
        </Field>
        {f.kind === "load" ? (
          <Field label="Commission on loads & packages (%)" hint="If paid per load, e.g. 2.8. If you get a bonus on top-up instead, leave 0.">
            <Input type="number" min="0" max="50" step="any" value={f.commissionPct} onChange={(e) => setF({ ...f, commissionPct: e.target.value })} aria-label="Commission percent" />
          </Field>
        ) : (
          <Field label="Usual fee for cash in / out (%)" hint="Filled in as a suggestion; you can change it per entry">
            <Input type="number" min="0" max="50" step="any" value={f.feePct} onChange={(e) => setF({ ...f, feePct: e.target.value })} aria-label="Fee percent" />
          </Field>
        )}
        {!isNew && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-brand-600" /> In use
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{isNew ? "Add" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function FloatModal({ target, onClose, onSaved }: { target: { w: WalletRow; kind: "float_in" | "float_out" | "commission" } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAmount("");
    setPaid("");
    setMethod("cash");
    setNote("");
  }, [target]);
  if (!target) return null;
  const { w, kind } = target;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/wallet-txns", { body: { walletId: w._id, type: kind, amount: Number(amount), ...(kind === "float_in" && paid !== "" ? { paid: Number(paid) } : {}), method: kind === "commission" ? "other" : method, note: note || undefined } });
      toast.success(kind === "float_in" ? "Topped up" : kind === "float_out" ? "Withdrawn" : "Commission recorded");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const title = kind === "float_in" ? `Top up ${w.name}` : kind === "float_out" ? `Withdraw from ${w.name}` : `Commission credited to ${w.name}`;
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label={kind === "float_in" ? "Balance received (Rs)" : "Amount (Rs)"} hint={`Now: ${formatPKR(w.balance)}`}>
          <Input autoFocus required type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        </Field>
        {kind === "float_in" && (
          <Field label="You paid (Rs)" hint="Less than received if the company gives a bonus — the difference is your commission">
            <Input type="number" min="0" value={paid} placeholder={amount || "same"} onChange={(e) => setPaid(e.target.value)} aria-label="Paid" />
          </Field>
        )}
        {kind !== "commission" && (
          <Field label={kind === "float_in" ? "Paid from" : "Money goes to"}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid from">
              <option value="cash">Cash drawer</option>
              <option value="bank">Bank</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        )}
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        </Field>
        <Button type="submit" className="w-full" loading={saving}>Save</Button>
      </form>
    </Modal>
  );
}

function CheckModal({ wallet, onClose, onSaved }: { wallet: WalletRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setActual("");
    setNote("");
  }, [wallet]);
  if (!wallet) return null;
  const diff = actual === "" ? 0 : round2(Number(actual) - wallet.balance);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ difference: number }>(`/api/wallets/${wallet!._id}/reconcile`, { body: { actual: Number(actual), note: note || undefined } });
      toast.success(r.difference ? `Balance corrected by ${formatPKR(r.difference)}` : "Balance matches");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Balance check — ${wallet.name}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-600">
          Records say <b>{formatPKR(wallet.balance)}</b>. Check the balance on the SIM / app and type it here.
        </p>
        <Field label="Balance on the SIM / app (Rs)">
          <Input autoFocus required type="number" min="0" step="any" value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Actual balance" />
        </Field>
        {actual !== "" && <p className={cn("text-sm font-semibold", diff === 0 ? "text-emerald-700" : "text-amber-700")}>{diff === 0 ? "Matches ✓" : `Difference ${formatPKR(diff)} will be recorded as a correction`}</p>}
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        </Field>
        <Button type="submit" className="w-full" loading={saving}>Save balance check</Button>
      </form>
    </Modal>
  );
}

function CancelModal({ txn, onClose, onSaved }: { txn: Txn | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setReason(""), [txn]);
  if (!txn) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/wallet-txns/${txn!._id}/reverse`, { body: { reason } });
      toast.success(`${txn!.txnNo} cancelled`);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cancel ${txn.txnNo}?`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-600">
          {WALLET_TXN_LABELS[txn.type]} of {formatPKR(txn.amount)}. The account balance{txn.cashEffect ? " and the drawer cash" : ""} go back as they were. Use this only when the entry was wrong or the money was returned.
        </p>
        <Field label="Why?">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Keep it</Button>
          <Button type="submit" variant="danger" loading={saving}>Cancel entry</Button>
        </div>
      </form>
    </Modal>
  );
}
