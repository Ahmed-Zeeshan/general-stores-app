"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarRange,
  Repeat,
  Wrench,
  Zap,
  ChefHat,
  PackagePlus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Badge, Card, Spinner, StatCard } from "@/components/ui";
import { SalesBarChart } from "@/components/charts";
import { SetupGuide } from "@/components/setup-guide";
import { DaySummaryButton } from "@/components/day-summary";
import { useCan, useSession } from "@/components/session";
import { api, formatDate, PAYMENT_LABELS, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";
import { WALLET_TXN_LABELS, type WalletTxnType } from "@/lib/constants";
import type { MobileReport } from "@/lib/mobile-report";

type Dashboard = {
  mobile: MobileReport | null;
  today: { sales: number; bills: number; profit: number; cash: number; credit: number; expenses: number; returns: number; returnCount: number; collected: number; collectedCash: number };
  receivable: { total: number; count: number };
  payable: { total: number; count: number };
  lowStock: { _id: string; name: string; stock: number; unit: string; lowStockAlert: number }[];
  lowStockCount: number;
  expiringCount: number;
  series: { date: string; total: number; profit: number }[];
  topProducts: { _id: string; qty: number; total: number; unit: string }[];
  recent: { _id: string; invoiceNo: string; total: number; paymentMethod: string; customerName?: string; createdAt: string; status: string }[];
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user, settings } = useSession();
  const can = useCan();
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>("/api/dashboard").then(setData).catch(() => {});
  }, []);

  const quick = [
    { href: "/pos", label: "New Bill", urdu: "نیا بل", icon: ShoppingCart, cls: "from-brand-500 to-brand-700" },
    { href: "/customers", label: "Receive Udhaar", urdu: "وصولی", icon: BookOpen, cls: "from-sky-500 to-sky-700" },
    ...(can.manage
      ? [
          settings?.shopType === "bakery"
            ? { href: "/production", label: "Production", urdu: "تیاری", icon: ChefHat, cls: "from-violet-500 to-violet-700" }
            : { href: "/purchases/new", label: "Add Stock", urdu: "مال آمد", icon: PackagePlus, cls: "from-violet-500 to-violet-700" },
          { href: "/expenses", label: "Add Expense", urdu: "خرچہ", icon: Wallet, cls: "from-amber-500 to-orange-600" },
        ]
      : [{ href: "/customers?new=1", label: "New Customer", urdu: "نیا گاہک", icon: UserPlus, cls: "from-violet-500 to-violet-700" }]),
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{formatDate(new Date())}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {user.name.split(" ")[0]} 👋
          </h1>
        </div>
        {can.manage && <DaySummaryButton />}
      </div>

      {user.role === "owner" && <SetupGuide />}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {quick.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={`group relative overflow-hidden rounded-2xl bg-linear-to-br ${q.cls} p-5 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl`}
          >
            <q.icon className="h-8 w-8 opacity-90" />
            <div className="mt-4 text-lg font-bold">{q.label}</div>
            <div className="urdu text-sm opacity-80">{q.urdu}</div>
            <ArrowRight className="absolute bottom-5 right-5 h-5 w-5 opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Today's Sales" value={formatPKR(data.today.sales)} icon={<TrendingUp className="h-5 w-5" />} hint={`${data.today.bills} bills${data.today.returnCount ? ` · ${formatPKR(data.today.returns)} returned` : ""} today`} />
            {can.manage ? (
              <StatCard
                label="Today's Profit"
                value={formatPKR(data.today.profit - data.today.expenses)}
                icon={<Receipt className="h-5 w-5" />}
                tone="violet"
                hint={`${formatPKR(data.today.profit)} profit − ${formatPKR(data.today.expenses)} expenses`}
              />
            ) : (
              <StatCard
                label="Cash Received Today"
                value={formatPKR(data.today.cash + data.today.collectedCash)}
                icon={<Wallet className="h-5 w-5" />}
                tone="violet"
                hint={data.today.collectedCash ? `incl. ${formatPKR(data.today.collectedCash)} udhaar collected` : "From bills"}
              />
            )}
            <Link href="/customers?due=1">
              <StatCard
                label="Udhaar to Collect"
                value={formatPKR(data.receivable.total)}
                icon={<BookOpen className="h-5 w-5" />}
                tone="amber"
                hint={`${data.receivable.count} customers owe you${data.today.collected ? ` · ${formatPKR(data.today.collected)} collected today` : ""}`}
              />
            </Link>
            {can.manage ? (
              <Link href="/suppliers">
                <StatCard
                  label="To Pay Suppliers"
                  value={formatPKR(data.payable.total)}
                  icon={<Truck className="h-5 w-5" />}
                  tone="rose"
                  hint={`${data.payable.count} suppliers`}
                />
              </Link>
            ) : (
              <Link href="/products?filter=low">
                <StatCard label="Low Stock Items" value={data.lowStockCount} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" />
              </Link>
            )}
          </div>

          {data.mobile && <MobileToday m={data.mobile} />}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900">Last 7 days</h2>
                  <p className="text-xs text-slate-500">Daily sales{can.manage && " and profit"}</p>
                </div>
                <div className="flex gap-4 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> Sales</span>
                  {can.manage && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-200" /> Profit</span>}
                </div>
              </div>
              <SalesBarChart data={data.series} showProfit={can.manage} />
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">Running low</h2>
                <Link href="/products?filter=low" className="text-sm font-semibold text-brand-600 hover:text-brand-700">See all</Link>
              </div>
              {data.expiringCount > 0 && (
                <Link href={can.manage ? "/expiry?within=7" : "/products?filter=expiring"} className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  <CalendarClock className="h-4 w-4" /> {data.expiringCount} {data.expiringCount === 1 ? "lot expires" : "lots expire"} within 7 days (or already expired)
                </Link>
              )}
              {data.lowStock.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">All items have enough stock 🎉</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.lowStock.map((p) => (
                    <li key={p._id} className="flex items-center justify-between py-2.5">
                      <span className="truncate pr-2 text-sm font-medium text-slate-700">{p.name}</span>
                      <Badge color={p.stock <= 0 ? "red" : "amber"}>
                        {formatQty(p.stock)} {UNIT_LABELS[p.unit] ?? p.unit}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 font-bold text-slate-900">Best sellers (30 days)</h2>
              {data.topProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No sales yet. Make your first bill!</p>
              ) : (
                <ul className="space-y-3">
                  {data.topProducts.map((p, i) => {
                    const max = data.topProducts[0].total || 1;
                    return (
                      <li key={p._id}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-slate-700">
                            {i + 1}. {p._id}
                          </span>
                          <span className="font-semibold text-slate-900">{formatPKR(p.total)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(p.total / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">Recent bills</h2>
                <Link href="/sales" className="text-sm font-semibold text-brand-600 hover:text-brand-700">See all</Link>
              </div>
              {data.recent.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No bills yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recent.map((s) => (
                    <li key={s._id}>
                      <Link href={`/receipt/${s._id}`} className="flex items-center justify-between py-2.5 hover:opacity-80">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {s.invoiceNo} {s.status === "returned" && <Badge color="red">Returned</Badge>}
                            {s.status === "partially_returned" && <Badge color="amber">Part returned</Badge>}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDate(s.createdAt, true)} · {s.customerName ?? "Walk-in"} · {PAYMENT_LABELS[s.paymentMethod]}
                          </div>
                        </div>
                        <span className="font-bold text-slate-900">{formatPKR(s.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** Today's mobile-shop work: repairs, Easyload / wallets, installments and used phones. */
function MobileToday({ m }: { m: MobileReport }) {
  const tiles: React.ReactNode[] = [];
  if (m.repairs) {
    const r = m.repairs;
    tiles.push(
      <Tile key="repairs" href="/repairs" icon={<Wrench className="h-5 w-5" />} title="Repairs" value={`${r.inShop} in shop`}>
        {r.ready > 0 && <Badge color="green">{r.ready} ready to collect</Badge>}
        {r.late > 0 && <Badge color="red">{r.late} late</Badge>}
        <div>
          {r.delivered} delivered today{r.profit !== undefined && r.delivered > 0 ? ` · profit ${formatPKR(r.profit)}` : ""}
        </div>
      </Tile>,
    );
  }
  if (m.wallets) {
    const w = m.wallets;
    tiles.push(
      <Tile key="wallets" href="/wallets" icon={<Zap className="h-5 w-5" />} title="Easyload & wallets" value={w.profit !== undefined ? `${formatPKR(w.profit)} earned` : `${w.count} entries`}>
        {w.low.length > 0 && <Badge color="amber">Low balance: {w.low.map((x) => x.name).join(", ")}</Badge>}
        <div>
          {w.byType.length
            ? w.byType
                .filter((t) => t.count > 0)
                .slice(0, 3)
                .map((t) => `${WALLET_TXN_LABELS[t.type as WalletTxnType] ?? t.type} ${t.count}`)
                .join(" · ")
            : "Nothing yet today"}
        </div>
      </Tile>,
    );
  }
  if (m.installments) {
    const q = m.installments;
    tiles.push(
      <Tile key="installments" href={q.latePlans ? "/installments?tab=late" : "/installments"} icon={<CalendarRange className="h-5 w-5" />} title="Installments" value={`${formatPKR(q.outstanding)} to collect`}>
        {q.latePlans > 0 && (
          <Badge color="red">
            {q.latePlans} late · {formatPKR(q.overdue)}
          </Badge>
        )}
        <div>
          {formatPKR(q.collected)} collected today{q.sold ? ` · ${q.sold} sold` : ""}
        </div>
      </Tile>,
    );
  }
  if (m.usedPhones) {
    tiles.push(
      <Tile key="used" href="/used-phones" icon={<Repeat className="h-5 w-5" />} title="Used phones bought" value={`${m.usedPhones.count} today`}>
        <div>{formatPKR(m.usedPhones.spent)} paid</div>
      </Tile>,
    );
  }
  if (!tiles.length) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-3 font-bold text-slate-900">Mobile shop today</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
    </div>
  );
}

function Tile({ href, icon, title, value, children }: { href: string; icon: React.ReactNode; title: string; value: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-brand-300 hover:shadow-md">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
        {title}
      </div>
      <div className="mt-2 text-xl font-extrabold text-slate-900">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{children}</div>
    </Link>
  );
}
