"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Eye, MessageCircle, PencilLine, Receipt, RotateCcw, Search, Undo2, X } from "lucide-react";
import { Badge, Button, Card, Count, EmptyState, Input, PageHeader, Segmented, Select, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { BranchFilter } from "@/components/branch-filter";
import { ReturnModal, type ReturnableSale } from "@/components/return-modal";
import { useConfirm } from "@/components/confirm";
import { useCan, useSession } from "@/components/session";
import { SendBillModal } from "@/components/send-whatsapp";
import { useToast } from "@/components/toast";
import { api, formatDate, PAYMENT_LABELS, todayISO } from "@/lib/client";
import { CORRECT_KEY, type CorrectionDraft } from "@/lib/correction";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Sale = ReturnableSale & {
  cashierName?: string;
  fbrStatus?: string;
  fbrInvoiceNumber?: string;
  fbrError?: string;
  branchName?: string;
  offline?: boolean;
  payments?: { method: string; amount: number }[];
  installment?: boolean;
  correctionOf?: { sale: string; invoiceNo: string };
  correctedBy?: { sale: string; invoiceNo: string };
};
type Ret = {
  _id: string;
  returnNo: string;
  invoiceNo: string;
  sale: string;
  customerName?: string;
  items: { name: string; qty: number }[];
  total: number;
  refund: number;
  creditReduced: number;
  refundMethod: string;
  reason?: string;
  userName?: string;
  branchName?: string;
  createdAt: string;
  fbrStatus?: string;
};

export default function SalesPage() {
  const toast = useToast();
  const t = useT();
  const can = useCan();
  const [tab, setTab] = useState<"bills" | "returns">("bills");
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [returns, setReturns] = useState<Ret[] | null>(null);
  const [returning, setReturning] = useState<Sale | null>(null);
  const showBranch = branch === "all";
  const { settings } = useSession();
  const [waBill, setWaBill] = useState<string | null>(null);
  const router = useRouter();
  const confirm = useConfirm();
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [fbr, setFbr] = useState("");
  // One cash drawer session (from the Cash Drawer page).
  const [shift, setShift] = useState<{ id: string; no?: string } | null>(null);
  // Opened from search, the drawer or the tasks bell: ?q=…&from=…&to=…&shift=…&fbr=…&status=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("q")) setQ(p.get("q")!);
    if (p.get("from") && p.get("to")) setRange({ from: p.get("from")!, to: p.get("to")! });
    if (p.get("fbr")) setFbr(p.get("fbr")!);
    if (p.get("status")) setStatus(p.get("status")!);
    const sh = p.get("shift");
    if (sh) {
      setShift({ id: sh });
      setBranch("all");
      api<{ shiftNo: string }>(`/api/shifts/${sh}`)
        .then((x) => setShift({ id: sh, no: x.shiftNo }))
        .catch(() => {});
    }
  }, []);

  const load = useCallback(() => {
    const qs = `from=${range.from}&to=${range.to}&branch=${branch}&q=${encodeURIComponent(q)}${shift ? `&shift=${shift.id}` : ""}`;
    api<Sale[]>(`/api/sales?${qs}&method=${method}&status=${status}&fbr=${fbr}`).then(setSales).catch((e) => toast.error(e.message));
    api<Ret[]>(`/api/returns?${qs}`).then(setReturns).catch(() => setReturns([]));
  }, [range, branch, q, shift, method, status, fbr, toast]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Correct a saved bill: return it in full, then open its lines in New Bill to fix and save again.
  async function correct(s: Sale) {
    const ok = await confirm({
      title: t("Correct bill {no}?", { no: s.invoiceNo }),
      message: t("Use this when a saved bill has a mistake (wrong item, quantity, price or customer)."),
      points: [
        t("Bill {no} is returned in full: stock goes back and its udhaar comes off the khata.", { no: s.invoiceNo }),
        t("New Bill opens with the same items so you can fix them and save the corrected bill."),
        t("Both bills stay on record, linked to each other."),
      ],
      tone: "warning",
      confirmLabel: "Correct this bill",
    });
    if (!ok) return;
    setCorrectingId(s._id);
    try {
      const draft = await api<CorrectionDraft & { refund: number; refundMethod: string }>(`/api/sales/${s._id}/correct`, { body: {} });
      try {
        localStorage.setItem(CORRECT_KEY, JSON.stringify(draft));
      } catch {
        /* ignore */
      }
      toast.success(t("Bill {no} returned. Fix the items and save the corrected bill.", { no: s.invoiceNo }));
      router.push("/pos");
    } catch (e) {
      toast.error((e as Error).message);
      setCorrectingId(null);
    }
  }

  const gross = sales?.reduce((a, s) => a + s.total, 0) ?? 0;
  const returned = returns?.reduce((a, r) => a + r.total, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Sales History" urdu="فروخت" subtitle="All bills and returns in your shop" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatPKR(gross)} icon={<Receipt className="h-5 w-5" />} hint={<Count n={sales?.length ?? 0} one="{n} bill" many="{n} bills" />} />
        <StatCard label="Returns" value={formatPKR(returned)} icon={<Undo2 className="h-5 w-5" />} tone="rose" hint={t("{n} returns", { n: returns?.length ?? 0 })} />
        <StatCard label="Net sales" value={formatPKR(gross - returned)} icon={<Receipt className="h-5 w-5" />} tone="violet" hint="Sales − returns" />
        <StatCard label="Average bill" value={formatPKR(sales?.length ? gross / sales.length : 0)} icon={<Receipt className="h-5 w-5" />} tone="blue" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "bills", label: "Bills" },
                { value: "returns", label: `Returns${returns?.length ? ` (${returns.length})` : ""}` },
              ]}
            />
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <BranchFilter value={branch} onChange={setBranch} />
            {tab === "bills" && (
              <>
                <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method" className="w-auto">
                  <option value="">{t("All payments")}</option>
                  {["cash", "card", "jazzcash", "easypaisa", "bank"].map((m) => (
                    <option key={m} value={m}>{t(PAYMENT_LABELS[m] ?? m)}</option>
                  ))}
                  <option value="credit">{t("Udhaar")}</option>
                </Select>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Bill status" className="w-auto">
                  <option value="">{t("All bills")}</option>
                  <option value="udhaar">{t("With udhaar")}</option>
                  <option value="partially_returned">{t("Part returned")}</option>
                  <option value="returned">{t("Returned")}</option>
                  <option value="corrected">{t("Corrected")}</option>
                </Select>
              </>
            )}
            {shift && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <Banknote className="h-4 w-4" /> {t("Drawer {no}", { no: shift.no ?? "…" })}
                <button type="button" onClick={() => setShift(null)} aria-label="Show all bills" className="rounded-full p-0.5 hover:bg-emerald-200">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {fbr && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                {t(fbr === "pending" ? "FBR pending" : "FBR")}
                <button type="button" onClick={() => setFbr("")} aria-label="Show all bills" className="rounded-full p-0.5 hover:bg-amber-200">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
          <div className="relative xl:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Bill no., return no. or customer")} className="pl-10" />
          </div>
        </div>

        {tab === "bills" ? (
          !sales ? (
            <Spinner />
          ) : sales.length === 0 ? (
            <EmptyState icon={<Receipt className="h-8 w-8" />} title="No bills in this period" action={<Link href="/pos"><Button>Make a bill</Button></Link>} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>Date & time</Th>
                  <Th>Customer</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s._id} className={s.status === "returned" ? "opacity-60" : "hover:bg-slate-50/60"}>
                    <Td>
                      <div className="font-semibold text-slate-800">{s.invoiceNo}</div>
                      <div className="text-xs text-slate-400">
                        <Count n={s.items.length} one="{n} item" many="{n} items" /> · {s.cashierName}
                        {showBranch && s.branchName && ` · ${s.branchName}`}
                        {s.offline && ` · ${t("made offline")}`}
                      </div>
                      {s.correctedBy && (
                        <Link href={`/receipt/${s.correctedBy.sale}`} target="_blank" className="block text-xs font-semibold text-amber-700 hover:underline">
                          {t("Corrected → {no}", { no: s.correctedBy.invoiceNo })}
                        </Link>
                      )}
                      {s.correctionOf && (
                        <Link href={`/receipt/${s.correctionOf.sale}`} target="_blank" className="block text-xs font-semibold text-sky-700 hover:underline">
                          {t("Correction of {no}", { no: s.correctionOf.invoiceNo })}
                        </Link>
                      )}
                    </Td>
                    <Td className="text-slate-500">{formatDate(s.createdAt, true)}</Td>
                    <Td>
                      {s.customerName ? (
                        s.customer ? (
                          <Link href={`/customers/${s.customer}`} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">{s.customerName}</Link>
                        ) : (
                          s.customerName
                        )
                      ) : (
                        <span className="text-slate-400">{t("Walk-in")}</span>
                      )}
                      {s.fbrStatus === "synced" && <div className="text-xs text-emerald-700">FBR ✓</div>}
                      {s.fbrStatus === "pending" && <div className="text-xs text-amber-700" title={s.fbrError}>{t("FBR pending")}</div>}
                    </Td>
                    <Td>
                      {s.status === "returned" ? (
                        <Badge color="red">Returned</Badge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {(s.payments?.length ?? 0) > 1 ? (
                            <Badge color="violet">{t("Split:")} {s.payments!.map((p) => t(PAYMENT_LABELS[p.method] ?? p.method)).join(" + ")}</Badge>
                          ) : (
                            <Badge color={s.paymentMethod === "credit" ? "amber" : s.paymentMethod === "cash" ? "green" : "blue"}>{PAYMENT_LABELS[s.paymentMethod]}</Badge>
                          )}
                          {s.status === "partially_returned" && <Badge color="red">Part returned</Badge>}
                        </div>
                      )}
                      {s.creditAmount > 0 && s.paymentMethod !== "credit" && s.status !== "returned" && (
                        <span className="text-xs text-amber-700">+{formatPKR(s.creditAmount)} {t("udhaar")}</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="font-bold text-slate-900">{formatPKR(s.total)}</div>
                      {(s.returnedTotal ?? 0) > 0 && s.status !== "returned" && <div className="text-xs text-rose-600">−{formatPKR(s.returnedTotal!)} {t("returned")}</div>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/receipt/${s._id}`} target="_blank">
                          <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />}>View</Button>
                        </Link>
                        <Button size="sm" variant="ghost" aria-label={`WhatsApp ${s.invoiceNo}`} title={t("Send the bill on WhatsApp")} icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setWaBill(s._id)} />
                        {can.manage && s.status !== "returned" && (
                          <Button size="sm" variant="ghost" className="hover:text-rose-600" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setReturning(s)}>
                            Return
                          </Button>
                        )}
                        {can.manage && s.status !== "returned" && !s.installment && (
                          <Button size="sm" variant="ghost" aria-label={`Correct ${s.invoiceNo}`} title={t("Correct a mistake in this bill")} loading={correctingId === s._id} icon={<PencilLine className="h-4 w-4" />} onClick={() => correct(s)}>
                            Correct
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : !returns ? (
          <Spinner />
        ) : returns.length === 0 ? (
          <EmptyState icon={<Undo2 className="h-8 w-8" />} title="No returns in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Return</Th>
                <Th>Date & time</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th className="text-right">Value</Th>
                <Th>Given back</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-800">{r.returnNo}</div>
                    <div className="text-xs text-slate-400">
                      <Link href={`/receipt/${r.sale}`} target="_blank" className="hover:text-brand-700 hover:underline">{t("bill {no}", { no: r.invoiceNo })}</Link>
                      {r.userName && ` · ${r.userName}`}
                      {showBranch && r.branchName && ` · ${r.branchName}`}
                    </div>
                  </Td>
                  <Td className="text-slate-500">{formatDate(r.createdAt, true)}</Td>
                  <Td>{r.customerName ?? <span className="text-slate-400">{t("Walk-in")}</span>}</Td>
                  <Td className="max-w-[260px] whitespace-normal text-slate-600">
                    {r.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                    {r.reason && <div className="text-xs text-slate-400">{r.reason}</div>}
                  </Td>
                  <Td className="text-right font-bold text-rose-600">{formatPKR(r.total)}</Td>
                  <Td className="text-sm">
                    {r.creditReduced > 0 && <div className="text-emerald-700">−{formatPKR(r.creditReduced)} {t("udhaar")}</div>}
                    {r.refund > 0 && (
                      <div>
                        {formatPKR(r.refund)} {r.refundMethod === "khata" ? t("to khata") : `(${t(PAYMENT_LABELS[r.refundMethod] ?? r.refundMethod)})`}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Link href={`/receipt/return/${r._id}`} target="_blank">
                      <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />}>View</Button>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <SendBillModal saleId={waBill} open={!!waBill} onClose={() => setWaBill(null)} shop={{ shopName: settings?.shopName ?? "", phone: settings?.phone }} />
      <ReturnModal sale={returning} onClose={() => setReturning(null)} onDone={load} />
    </div>
  );
}
