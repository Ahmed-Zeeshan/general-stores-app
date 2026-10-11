"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, CalendarClock, CalendarRange, Search, Wallet } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { PlanStatus, type PlanRow } from "@/components/installments";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";

type Tab = "active" | "late" | "today" | "completed" | "cancelled" | "all";
type Summary = { active: number; outstanding: number; overdue: number; latePlans: number };

export default function InstallmentsPage() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: PlanRow[]; summary: Summary } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  // Opened from the dashboard's "late" link.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && ["active", "late", "today", "completed", "cancelled", "all"].includes(t)) setTab(t as Tab);
  }, []);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (tab === "late" || tab === "today") {
      p.set("status", "active");
      p.set("due", tab);
    } else p.set("status", tab);
    if (q.trim()) p.set("q", q.trim());
    api<{ rows: PlanRow[]; summary: Summary }>(`/api/installments?${p}`)
      .then((r) => {
        setData(r);
        if (tab === "active" && !q.trim()) setSummary(r.summary);
      })
      .catch((e) => toast.error(e.message));
  }, [tab, q, toast]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  // The cards always show the whole shop, whichever tab is open.
  useEffect(() => {
    api<{ summary: Summary }>("/api/installments?status=active")
      .then((r) => setSummary(r.summary))
      .catch(() => {});
  }, []);

  const rows = data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Installments"
        urdu="قسطیں"
        subtitle="Goods sold on monthly installments: who owes what, what is late and what is due"
        actions={
          <Link href="/pos">
            <Button icon={<CalendarRange className="h-4 w-4" />}>New sale on installments</Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Running plans" value={summary?.active ?? "—"} icon={<CalendarRange className="h-5 w-5" />} hint="Not fully paid yet" />
        <StatCard label="Still to collect" value={summary ? formatPKR(summary.outstanding) : "—"} icon={<Wallet className="h-5 w-5" />} tone="green" hint="All running plans" />
        <StatCard label="Late amount" value={summary ? formatPKR(summary.overdue) : "—"} icon={<AlarmClock className="h-5 w-5" />} tone="rose" hint="Installments past their date" />
        <StatCard label="Late customers" value={summary?.latePlans ?? "—"} icon={<CalendarClock className="h-5 w-5" />} tone="amber" hint="Send them a WhatsApp reminder" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: "Running" },
              { value: "late", label: `Late${summary?.latePlans ? ` (${summary.latePlans})` : ""}` },
              { value: "today", label: "Due today" },
              { value: "completed", label: "Paid off" },
              { value: "cancelled", label: "Closed" },
              { value: "all", label: "All" },
            ]}
          />
          <div className="relative xl:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, mobile, CNIC, IMEI, plan no…" className="pl-9" aria-label="Search installments" />
          </div>
        </div>
        {!data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CalendarRange className="h-7 w-7" />}
            title={tab === "late" ? "Nobody is late" : tab === "today" ? "Nothing due today" : "No installment plans here"}
            text={tab === "active" && !q ? "On the sale screen, press “Take Payment” and then “Sell on installments”." : "Try another tab or search."}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Customer</Th>
                <Th>Goods</Th>
                <Th>Next installment</Th>
                <Th className="text-right">Paid / total</Th>
                <Th className="text-right">Left</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => router.push(`/installments/${p._id}`)}>
                  <Td>
                    <div className="font-semibold text-slate-800">{p.planNo}</div>
                    <div className="text-xs text-slate-500">
                      {formatDate(p.createdAt)} · {p.invoiceNo}
                    </div>
                  </Td>
                  <Td>
                    <div>{p.customerName}</div>
                    <div className="text-xs text-slate-500">{p.customerPhone}</div>
                  </Td>
                  <Td data-long>
                    <div className="max-w-xs truncate text-sm text-slate-700" title={p.itemsText}>
                      {p.itemsText}
                    </div>
                  </Td>
                  <Td>
                    {p.status !== "active" ? (
                      <PlanStatus plan={p} />
                    ) : p.lateCount > 0 ? (
                      <div>
                        <Badge color="red">
                          {p.lateCount} late · {p.daysLate} days
                        </Badge>
                        <div className="text-xs font-semibold text-rose-600">{formatPKR(p.overdue)} overdue</div>
                      </div>
                    ) : p.next ? (
                      <div>
                        <div className={p.dueToday ? "font-semibold text-amber-700" : "text-slate-700"}>{p.dueToday ? "Today" : formatDate(p.next.dueDate)}</div>
                        <div className="text-xs text-slate-500">{formatPKR(p.next.amount)}</div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="font-semibold">{formatPKR(p.paid)}</div>
                    <div className="text-xs text-slate-500">of {formatPKR(p.financed)}</div>
                  </Td>
                  <Td className="text-right font-bold text-slate-900">{p.status === "active" ? formatPKR(p.balance) : "—"}</Td>
                  <Td className="text-right">
                    <Link href={`/installments/${p._id}`} onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost">
                        Open
                      </Button>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
