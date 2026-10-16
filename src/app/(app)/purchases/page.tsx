"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Eye, Minus, PackagePlus, Plus, RotateCcw, Undo2 } from "lucide-react";
import { Badge, Button, Card, cn, Count, EmptyState, Field, Modal, PageHeader, Segmented, Select, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { BranchFilter } from "@/components/branch-filter";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate, todayISO, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty, round2 } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Item = { name: string; unit: string; qty: number; cost: number; total: number; returnedQty?: number; serials?: { device: string; imei: string; returned?: boolean }[] };
type Purchase = {
  _id: string;
  purchaseNo: string;
  supplier?: string;
  supplierName?: string;
  supplierInvoice?: string;
  branchName?: string;
  items: Item[];
  total: number;
  amountPaid: number;
  returnedTotal?: number;
  status?: "received" | "partially_returned" | "returned" | "void";
  voidReason?: string;
  voidedByName?: string;
  voidedAt?: string;
  note?: string;
  createdAt: string;
};
type PReturn = {
  _id: string;
  returnNo: string;
  purchaseNo: string;
  supplierName?: string;
  items: { name: string; qty: number; unit: string }[];
  total: number;
  settlement: "khata" | "cash";
  reason?: string;
  userName?: string;
  createdAt: string;
};

const REASONS = ["Damaged", "Expired", "Wrong item", "Extra quantity", "Quality problem", "Other"];
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export default function PurchasesPage() {
  const toast = useToast();
  const t = useT();
  const [tab, setTab] = useState<"purchases" | "returns">("purchases");
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [branch, setBranch] = useState("");
  const [list, setList] = useState<Purchase[] | null>(null);
  const [returns, setReturns] = useState<PReturn[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = `from=${range.from}&to=${range.to}&branch=${branch}`;
    api<Purchase[]>(`/api/purchases?${qs}`).then(setList).catch((e) => toast.error(e.message));
    api<PReturn[]>(`/api/purchase-returns?${qs}`).then(setReturns).catch(() => setReturns([]));
  }, [range, branch, toast]);
  useEffect(load, [load]);

  const active = list?.filter((p) => p.status !== "void") ?? [];
  const total = active.reduce((s, p) => s + p.total, 0);
  const returnedValue = returns?.reduce((s, r) => s + r.total, 0) ?? 0;
  const unpaid = active.filter((p) => p.supplier).reduce((s, p) => s + Math.max(0, p.total - p.amountPaid), 0);

  return (
    <div>
      <PageHeader
        title="Purchases"
        urdu="خریداری"
        subtitle="Stock you bought from suppliers, and goods sent back"
        actions={
          <Link href="/purchases/new">
            <Button icon={<Plus className="h-4 w-4" />}>New purchase</Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total purchased" value={formatPKR(total)} icon={<PackagePlus className="h-5 w-5" />} tone="violet" hint={t("{n} purchases", { n: active.length })} />
        <StatCard label="Returned to suppliers" value={formatPKR(returnedValue)} icon={<Undo2 className="h-5 w-5" />} tone="amber" hint={t("{n} returns", { n: returns?.length ?? 0 })} />
        <StatCard label="Not paid at purchase time" value={formatPKR(unpaid)} icon={<PackagePlus className="h-5 w-5" />} tone="rose" hint="See Suppliers for the khata balance" />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "purchases", label: "Purchases" },
              { value: "returns", label: `Returns to suppliers${returns?.length ? ` (${returns.length})` : ""}` },
            ]}
          />
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <BranchFilter value={branch} onChange={setBranch} />
        </div>
        {tab === "purchases" ? (
          !list ? (
            <Spinner />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<PackagePlus className="h-8 w-8" />}
              title="No purchases in this period"
              text="When new stock arrives, record it here. Stock and cost prices update automatically."
              action={<Link href="/purchases/new"><Button>Record a purchase</Button></Link>}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Purchase</Th>
                  <Th>Date</Th>
                  <Th>Supplier</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Paid</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p._id} className={p.status === "void" ? "opacity-60" : "hover:bg-slate-50/60"}>
                    <Td>
                      <div className={cn("font-semibold text-slate-800", p.status === "void" && "line-through")}>{p.purchaseNo}</div>
                      <div className="text-xs text-slate-400">
                        <Count n={p.items.length} one="{n} item" many="{n} items" />{p.supplierInvoice && ` · ${t("Inv {no}", { no: p.supplierInvoice })}`}
                        {p.branchName && branch === "all" && ` · ${p.branchName}`}
                      </div>
                    </Td>
                    <Td className="text-slate-500">{formatDate(p.createdAt, true)}</Td>
                    <Td>{p.supplierName ?? <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-right">
                      <div className="font-bold">{formatPKR(p.total)}</div>
                      {(p.returnedTotal ?? 0) > 0 && <div className="text-xs text-amber-700">−{t("{n} returned", { n: formatPKR(p.returnedTotal!) })}</div>}
                    </Td>
                    <Td className="text-right">
                      {p.status === "void" ? (
                        <Badge color="red">Cancelled</Badge>
                      ) : p.amountPaid >= p.total ? (
                        <Badge color="green">Paid</Badge>
                      ) : (
                        <Badge color="amber">{formatPKR(p.amountPaid)}</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setViewing(p._id)}>
                        Open
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : !returns ? (
          <Spinner />
        ) : returns.length === 0 ? (
          <EmptyState icon={<Undo2 className="h-8 w-8" />} title="No goods returned to suppliers in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Return</Th>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <Th>Items</Th>
                <Th className="text-right">Value</Th>
                <Th>Settled by</Th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r._id}>
                  <Td>
                    <div className="font-semibold text-slate-800">{r.returnNo}</div>
                    <div className="text-xs text-slate-400">{t("from {no}", { no: r.purchaseNo })}{r.userName && ` · ${r.userName}`}</div>
                  </Td>
                  <Td className="text-slate-500">{formatDate(r.createdAt, true)}</Td>
                  <Td>{r.supplierName ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="max-w-[260px] whitespace-normal text-slate-600">
                    {r.items.map((i) => `${i.name} ×${formatQty(i.qty)}`).join(", ")}
                    {r.reason && <div className="text-xs text-slate-400">{r.reason}</div>}
                  </Td>
                  <Td className="text-right font-bold">{formatPKR(r.total)}</Td>
                  <Td>{r.settlement === "khata" ? <Badge color="blue">Less in khata</Badge> : <Badge color="green">Cash back</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <PurchaseModal id={viewing} onClose={() => setViewing(null)} onChanged={load} />
    </div>
  );
}

function PurchaseModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const t = useT();
  const confirm = useConfirm();
  const [p, setP] = useState<(Purchase & { returns: PReturn[] }) | null>(null);
  const [mode, setMode] = useState<"view" | "return">("view");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [phones, setPhones] = useState<Record<number, string[]>>({});
  const [settlement, setSettlement] = useState<"khata" | "cash">("khata");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    api<Purchase & { returns: PReturn[] }>(`/api/purchases/${id}`)
      .then((x) => {
        setP(x);
        setSettlement(x.supplier ? "khata" : "cash");
      })
      .catch((e) => toast.error(e.message));
  }, [id, toast]);
  useEffect(() => {
    setP(null);
    setMode("view");
    setQty({});
    setPhones({});
    setReason("");
    load();
  }, [load]);

  if (!id) return null;
  const lines = (p?.items ?? []).map((it, index) => {
    const left = round3(it.qty - (it.returnedQty ?? 0));
    const q = it.serials?.length ? (phones[index] ?? []).length : Math.min(left, Math.max(0, Number(qty[index]) || 0));
    return { ...it, index, left, q };
  });
  const chosen = lines.filter((l) => l.q > 0);
  const value = round2(chosen.reduce((a, l) => a + l.cost * l.q, 0));
  const canAct = p && p.status !== "void" && p.status !== "returned";

  async function saveReturn() {
    if (!p) return;
    setSaving(true);
    try {
      const r = await api<PReturn>(`/api/purchases/${p._id}/return`, {
        body: { items: chosen.map((l) => ({ index: l.index, qty: l.q, ...(l.serials?.length ? { serials: phones[l.index] } : {}) })), settlement, reason: reason || undefined },
      });
      toast.success(t(r.settlement === "khata" ? "{no} saved — {amount} taken off the supplier's khata" : "{no} saved — {amount} cash back from supplier", { no: r.returnNo, amount: formatPKR(r.total) }));
      setMode("view");
      setQty({});
      setPhones({});
      load();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelPurchase() {
    if (!p) return;
    const ok = await confirm({
      title: t("Cancel purchase {no}?", { no: p.purchaseNo }),
      message: t("Use this only if the purchase was entered by mistake. It stays in the list marked as cancelled."),
      details: [
        { label: t("Supplier"), value: p.supplierName ?? "—" },
        { label: t("Items"), value: p.items.length },
        { label: t("Total"), value: formatPKR(p.total), strong: true },
      ],
      points: [
        t("All its items are taken back out of stock."),
        p.supplier ? t("{amount} still owed to the supplier is removed from their khata.", { amount: formatPKR(p.total - p.amountPaid) }) : t("The {amount} paid is counted as money back.", { amount: formatPKR(p.amountPaid) }),
      ],
      tone: "danger",
      confirmLabel: "Cancel purchase",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    try {
      await api(`/api/purchases/${p._id}/void`, { body: {} });
      toast.success(t("Purchase cancelled"));
      load();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={p ? (mode === "return" ? t("Return to supplier — {no}", { no: p.purchaseNo }) : p.purchaseNo) : "Purchase"}
      size="lg"
      footer={
        p && mode === "return" ? (
          <>
            <Button variant="outline" onClick={() => setMode("view")}>Back</Button>
            <Button variant="danger" loading={saving} disabled={!chosen.length} icon={<RotateCcw className="h-4 w-4" />} onClick={saveReturn}>
              {value ? t("Return {amount}", { amount: formatPKR(value) }) : `${t("Return")} `}
            </Button>
          </>
        ) : p && canAct ? (
          <>
            {(p.returnedTotal ?? 0) === 0 && (
              <Button variant="ghost" className="mr-auto text-rose-600" icon={<Ban className="h-4 w-4" />} onClick={cancelPurchase}>
                Cancel purchase
              </Button>
            )}
            <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setMode("return")}>Return to supplier</Button>
          </>
        ) : undefined
      }
    >
      {!p ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{formatDate(p.createdAt, true)}</span>
            <span>· {p.supplierName ?? t("No supplier")}</span>
            {p.supplierInvoice && <span>· {t("Inv {no}", { no: p.supplierInvoice })}</span>}
            {p.branchName && <span>· {p.branchName}</span>}
            {p.status === "void" && <Badge color="red">Cancelled</Badge>}
            {p.status === "partially_returned" && <Badge color="amber">Part returned</Badge>}
            {p.status === "returned" && <Badge color="amber">All returned</Badge>}
          </div>
          {p.status === "void" && (
            <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {t("Cancelled")} {p.voidedAt && formatDate(p.voidedAt, true)}{p.voidedByName && ` ${t("by {name}", { name: p.voidedByName })}`}{p.voidReason && ` — ${p.voidReason}`}
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {lines.map((l) => (
              <li key={l.index} className={cn("flex items-center gap-3 px-4 py-3", mode === "return" && l.left <= 0 && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-800">{l.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatQty(l.qty)} {UNIT_LABELS[l.unit] ?? l.unit} × {formatPKR(l.cost)}
                    {(l.returnedQty ?? 0) > 0 && <span className="text-amber-700"> · {t("{n} returned", { n: formatQty(l.returnedQty!) })}</span>}
                  </div>
                  {mode === "view" && l.serials?.length ? (
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {l.serials.map((x) => (
                        <span key={x.device} className={cn("mr-2", x.returned && "line-through")}>{x.imei}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {mode === "return" && l.left > 0 && l.serials?.length ? (
                  <div className="flex flex-col gap-1">
                    {l.serials.map((x) => (
                      <label key={x.device} className={cn("flex items-center gap-2 font-mono text-xs", x.returned && "text-slate-400 line-through")}>
                        <input
                          type="checkbox"
                          disabled={x.returned}
                          checked={(phones[l.index] ?? []).includes(x.device)}
                          onChange={() =>
                            setPhones((ph) => ({ ...ph, [l.index]: (ph[l.index] ?? []).includes(x.device) ? (ph[l.index] ?? []).filter((d) => d !== x.device) : [...(ph[l.index] ?? []), x.device] }))
                          }
                          className="h-4 w-4 accent-rose-600"
                          aria-label={`Return IMEI ${x.imei} to supplier`}
                        />
                        {x.imei}
                      </label>
                    ))}
                  </div>
                ) : mode === "return" && l.left > 0 ? (
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                    <button type="button" className="flex h-9 w-9 items-center justify-center text-slate-600" aria-label="Less" onClick={() => setQty({ ...qty, [l.index]: String(Math.max(0, round3(l.q - 1))) })}>
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
                    <button type="button" className="flex h-9 w-9 items-center justify-center text-slate-600" aria-label="More" onClick={() => setQty({ ...qty, [l.index]: String(Math.min(l.left, round3(l.q + 1))) })}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                <span className="w-24 text-right text-sm font-semibold text-slate-800">{formatPKR(mode === "return" ? l.cost * l.q : l.total)}</span>
              </li>
            ))}
          </ul>
          {mode === "view" ? (
            <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{t("Total")}</span><b>{formatPKR(p.total)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("Paid at purchase")}</span><b>{formatPKR(p.amountPaid)}</b></div>
              {(p.returnedTotal ?? 0) > 0 && <div className="flex justify-between"><span className="text-slate-500">{t("Returned to supplier")}</span><b className="text-amber-700">−{formatPKR(p.returnedTotal!)}</b></div>}
              {p.returns.length > 0 && (
                <ul className="mt-2 border-t border-dashed border-slate-200 pt-2 text-xs text-slate-500">
                  {p.returns.map((r) => (
                    <li key={r._id}>
                      {r.returnNo} · {formatDate(r.createdAt, true)} · {formatPKR(r.total)} · {r.settlement === "khata" ? t("less in khata") : t("cash back")}
                      {r.reason && ` · ${r.reason}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Settle by">
                <Select value={settlement} onChange={(e) => setSettlement(e.target.value as "khata" | "cash")} aria-label="Settle by">
                  {p.supplier && <option value="khata">{t("Take off supplier's khata")}</option>}
                  <option value="cash">{t("Supplier gave cash back")}</option>
                </Select>
              </Field>
              <Field label="Reason">
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">{t("Choose (optional)")}</option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{t(r)}</option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-slate-500 sm:col-span-2">{t("The items leave stock at {branch} at their purchase cost.", { branch: p.branchName ?? t("this branch") })}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
