"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign, Printer, Receipt, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button, Card, Count, PageHeader, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { BranchFilter } from "@/components/branch-filter";
import { SalesBarChart } from "@/components/charts";
import { useToast } from "@/components/toast";
import { api, PAYMENT_LABELS, todayISO, UNIT_LABELS } from "@/lib/client";
import { useT } from "@/lib/i18n";
import { formatPKR, formatQty } from "@/lib/money";
import { WALLET_TXN_LABELS, type WalletTxnType } from "@/lib/constants";
import type { MobileReport } from "@/lib/mobile-report";

type Report = {
  summary: {
    bills: number;
    grossSales: number;
    discount: number;
    tax: number;
    netSales: number;
    salesBeforeReturns: number;
    refunds: number;
    cost: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    credit: number;
    avgBill: number;
    purchases: number;
    purchaseReturns: number;
    returns: number;
    returnCount: number;
    udhaarCollected: number;
    paidToSuppliers: number;
    repairProfit: number;
    walletProfit: number;
    installmentProfit?: number;
    wastage?: number;
  };
  mobile: MobileReport | null;
  collectedByMethod: { _id: string; total: number; count: number }[];
  byMethod: { _id: string; total: number; count: number }[];
  refundsByMethod: { _id: string; total: number; count: number }[];
  byDay: { date: string; total: number; profit: number; bills: number }[];
  topItems: { _id: string; unit: string; qty: number; total: number; profit: number }[];
  expenses: { _id: string; total: number }[];
  byBranch: { _id: string; name: string; total: number; profit: number; bills: number }[];
};

export default function ReportsPage() {
  const toast = useToast();
  const tr = useT();
  const [range, setRange] = useState({ from: todayISO(-6), to: todayISO() });
  const [branch, setBranch] = useState("");
  const [data, setData] = useState<Report | null>(null);

  useEffect(() => {
    setData(null);
    api<Report>(`/api/reports?from=${range.from}&to=${range.to}&branch=${branch}`).then(setData).catch((e) => toast.error(e.message));
  }, [range, branch, toast]);

  const s = data?.summary;
  return (
    <div>
      <PageHeader
        title="Reports"
        urdu="رپورٹس"
        subtitle="Profit & loss, best sellers and payment summary"
        actions={<Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>}
      />
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <BranchFilter value={branch} onChange={setBranch} />
      </div>
      {!data || !s ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
            <StatCard label="Net sales" value={formatPKR(s.netSales)} icon={<TrendingUp className="h-5 w-5" />} hint={<><Count n={s.bills} one="{n} bill" many="{n} bills" /> · {tr("avg {amount}", { amount: formatPKR(s.avgBill) })}</>} />
            <StatCard label="Gross profit" value={formatPKR(s.grossProfit)} icon={<BadgeDollarSign className="h-5 w-5" />} tone="violet" hint="Sales − cost of goods − tax" />
            <StatCard label="Expenses" value={formatPKR(s.expenses)} icon={<Wallet className="h-5 w-5" />} tone="amber" />
            <StatCard
              label="Net profit"
              value={<span className={s.netProfit < 0 ? "text-rose-600" : "text-emerald-700"}>{formatPKR(s.netProfit)}</span>}
              icon={s.netProfit < 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
              tone={s.netProfit < 0 ? "rose" : "green"}
              hint={s.repairProfit || s.walletProfit || s.installmentProfit ? "Gross profit + repairs + Easyload/wallets + installments − expenses" : "Gross profit − expenses"}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 font-bold text-slate-900">{tr("Daily sales & profit")}</h2>
              {data.byDay.length ? <SalesBarChart data={data.byDay} /> : <p className="py-16 text-center text-sm text-slate-500">{tr("No sales in this period.")}</p>}
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 font-bold text-slate-900">{tr("Profit & Loss")}</h2>
              <dl className="space-y-2.5 text-sm">
                <PL label="Sales (as billed)" value={s.salesBeforeReturns} />
                <PL label={`− Returns (${s.returnCount})`} value={-s.returns} />
                <PL label="= Net sales" value={s.netSales} bold />
                <PL label="− Sales tax collected" value={-s.tax} />
                <PL label="= Sales excl. tax" value={s.netSales - s.tax} bold />
                <PL label="− Cost of goods sold" value={-s.cost} />
                <PL label="= Gross profit" value={s.grossProfit} bold />
                {data.mobile?.repairs && <PL label="+ Repairs profit" value={s.repairProfit} />}
                {data.mobile?.wallets && <PL label="+ Easyload & wallet earnings" value={s.walletProfit} />}
                {data.mobile?.installments && <PL label="+ Installment markup (less write-offs)" value={s.installmentProfit ?? 0} />}
                {(s.wastage ?? 0) > 0 && <PL label="− Stock written off (wastage / expired, at cost)" value={-(s.wastage ?? 0)} />}
                <PL label="− Expenses" value={-s.expenses} />
                <div className="border-t border-dashed border-slate-200 pt-2.5">
                  <PL label="Net profit" value={s.netProfit} bold big />
                </div>
              </dl>
              <div className="mt-5 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex justify-between"><span>{tr("Discounts given")}</span><b>{formatPKR(s.discount)}</b></div>
                <div className="flex justify-between"><span>{tr(s.purchaseReturns ? "Stock purchased (after returns)" : "Stock purchased")}</span><b>{formatPKR(s.purchases)}</b></div>
                {s.purchaseReturns > 0 && <div className="flex justify-between"><span>{tr("Returned to suppliers")}</span><b>{formatPKR(s.purchaseReturns)}</b></div>}
                <div className="flex justify-between"><span>{tr("Given on udhaar")}</span><b>{formatPKR(s.credit)}</b></div>
                <div className="flex justify-between"><span>{tr("Money refunded on returns")}</span><b>{formatPKR(s.refunds)}</b></div>
                <div className="flex justify-between"><span>{tr("Udhaar collected")}</span><b className="text-emerald-700">{formatPKR(s.udhaarCollected)}</b></div>
                <div className="flex justify-between"><span>{tr("Paid to suppliers")}</span><b>{formatPKR(s.paidToSuppliers)}</b></div>
              </div>
            </Card>
          </div>

          {data.mobile && <MobileSection m={data.mobile} />}

          {data.byBranch.length > 1 && (
            <Card className="mt-6">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-bold text-slate-900">{tr("Sales by branch")}</h2>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Branch</Th>
                    <Th className="text-right">Bills</Th>
                    <Th className="text-right">Sales</Th>
                    <Th className="text-right">Gross profit</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBranch.map((b) => (
                    <tr key={b._id}>
                      <Td className="font-medium">{b.name}</Td>
                      <Td className="text-right">{b.bills}</Td>
                      <Td className="text-right font-semibold">{formatPKR(b.total)}</Td>
                      <Td className="text-right text-emerald-700">{formatPKR(b.profit)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="lg:col-span-2">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-bold text-slate-900">{tr("Top selling items")}</h2>
              </div>
              {data.topItems.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">{tr("No sales.")}</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Item</Th>
                      <Th className="text-right">Qty sold</Th>
                      <Th className="text-right">Sales</Th>
                      <Th className="text-right">Profit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topItems.map((t, i) => (
                      <tr key={t._id}>
                        <Td className="text-slate-400">{i + 1}</Td>
                        <Td className="font-medium">{t._id}</Td>
                        <Td className="text-right">{formatQty(t.qty)} {tr(UNIT_LABELS[t.unit] ?? t.unit)}</Td>
                        <Td className="text-right font-semibold">{formatPKR(t.total)}</Td>
                        <Td className={`text-right font-semibold ${t.profit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatPKR(t.profit)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Receipt className="h-4 w-4" /> {tr("Money received")}</h2>
                {data.byMethod.length === 0 ? (
                  <p className="text-sm text-slate-500">{tr("No sales.")}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.byMethod.map((m) => (
                      <li key={m._id} className="flex justify-between">
                        <span className="text-slate-600">{tr(PAYMENT_LABELS[m._id] ?? m._id)} <span className="text-slate-400">({m.count})</span></span>
                        <b>{formatPKR(m.total)}</b>
                      </li>
                    ))}
                  </ul>
                )}
                {data.collectedByMethod.length > 0 && (
                  <>
                    <div className="mb-2 mt-4 border-t border-dashed border-slate-200 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Old udhaar collected")}</div>
                    <ul className="space-y-2 text-sm">
                      {data.collectedByMethod.map((m) => (
                        <li key={m._id} className="flex justify-between">
                          <span className="text-slate-600">{tr(PAYMENT_LABELS[m._id] ?? m._id)} <span className="text-slate-400">({m.count})</span></span>
                          <b className="text-emerald-700">+{formatPKR(m.total)}</b>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {data.refundsByMethod.some((r) => r.total > 0) && (
                  <>
                    <div className="mb-2 mt-4 border-t border-dashed border-slate-200 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Refunded on returns")}</div>
                    <ul className="space-y-2 text-sm">
                      {data.refundsByMethod
                        .filter((r) => r.total > 0)
                        .map((r) => (
                          <li key={r._id} className="flex justify-between">
                            <span className="text-slate-600">{tr(r._id === "khata" ? "To khata" : PAYMENT_LABELS[r._id] ?? r._id)}</span>
                            <b className="text-rose-600">−{formatPKR(r.total)}</b>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><ShoppingBag className="h-4 w-4" /> {tr("Expenses")}</h2>
                {data.expenses.length === 0 ? (
                  <p className="text-sm text-slate-500">{tr("No expenses.")}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.expenses.map((e) => (
                      <li key={e._id} className="flex justify-between">
                        <span className="text-slate-600">{tr(e._id)}</span>
                        <b>{formatPKR(e.total)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One line of the profit & loss. A line labelled "− …" is taken away; its label already says so, so
 * the amount is shown without a second minus ("− Returns (1)  Rs 600", not "Rs -600").
 */
function PL({ label, value, bold, big }: { label: string; value: number; bold?: boolean; big?: boolean }) {
  const t = useT();
  const minus = /^[−-]\s*/.test(label);
  const text = label.replace(/^[−-]\s*/, "");
  const shown = minus ? -value : value;
  return (
    <div className="flex justify-between">
      <dt className={bold ? "font-semibold text-slate-800" : "text-slate-500"}>
        {minus && "− "}
        {t(text)}
      </dt>
      <dd className={`${bold ? "font-bold" : "font-medium"} ${big ? "text-lg" : ""} ${value < 0 && big ? "text-rose-600" : "text-slate-900"}`}>{formatPKR(shown)}</dd>
    </div>
  );
}

/** Repairs, Easyload / wallets, used phones and installments for the period. */
function MobileSection({ m }: { m: MobileReport }) {
  const tr = useT();
  const line = (label: string, value: React.ReactNode, tone?: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-slate-600">{tr(label)}</span>
      <b className={tone}>{value}</b>
    </div>
  );
  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
      {m.repairs && (
        <Card className="p-5">
          <h2 className="mb-3 font-bold text-slate-900">{tr("Repairs")}</h2>
          <div className="space-y-2 text-sm">
            {line("Delivered", m.repairs.delivered)}
            {line("Repair bills", formatPKR(m.repairs.income))}
            {line("− Parts cost", formatPKR(m.repairs.partsCost))}
            {line("Profit", formatPKR(m.repairs.profit), "text-emerald-700")}
            {line("Money received", formatPKR(m.repairs.collected))}
            {line("In the shop now", `${m.repairs.inShop}${m.repairs.ready ? ` (${tr("{n} ready", { n: m.repairs.ready })})` : ""}`)}
          </div>
        </Card>
      )}
      {m.wallets && (
        <Card className="p-5">
          <h2 className="mb-3 font-bold text-slate-900">{tr("Easyload & wallets")}</h2>
          <div className="space-y-2 text-sm">
            {m.wallets.byType.length === 0 && <p className="text-slate-500">{tr("No entries.")}</p>}
            {m.wallets.byType.map((t) => line(`${WALLET_TXN_LABELS[t.type as WalletTxnType] ?? t.type} (${t.count})`, formatPKR(t.amount)))}
            <div className="border-t border-dashed border-slate-200 pt-2">{line("Earned (commission + fees)", formatPKR(m.wallets.profit), "text-emerald-700")}</div>
            {line("Balance in all SIMs / accounts", formatPKR(m.wallets.balance))}
          </div>
        </Card>
      )}
      {m.installments && (
        <Card className="p-5">
          <h2 className="mb-3 font-bold text-slate-900">{tr("Installments")}</h2>
          <div className="space-y-2 text-sm">
            {line("Sold on installments", `${m.installments.sold} · ${formatPKR(m.installments.soldValue)}`)}
            {line("Markup on these", formatPKR(m.installments.markup ?? 0))}
            {line("Installments collected", formatPKR(m.installments.collected), "text-emerald-700")}
            <div className="border-t border-dashed border-slate-200 pt-2">{line("Still to collect (all plans)", formatPKR(m.installments.outstanding))}</div>
            {line("Late now", `${formatPKR(m.installments.overdue)} · ${tr("{n} plans", { n: m.installments.latePlans })}`, m.installments.latePlans ? "text-rose-600" : undefined)}
          </div>
        </Card>
      )}
      {m.usedPhones && (
        <Card className="p-5">
          <h2 className="mb-3 font-bold text-slate-900">{tr("Used phones bought")}</h2>
          <div className="space-y-2 text-sm">
            {line("Phones bought", m.usedPhones.count)}
            {line("Paid to sellers", formatPKR(m.usedPhones.spent))}
            <p className="text-xs text-slate-500">{tr("They are in stock now; the profit shows when they are sold.")}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
