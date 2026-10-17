"use client";

import { RefLink } from "@/components/ref-link";
import { refLink } from "@/lib/links";
import { useCallback, useEffect, useState } from "react";
import { Download, History, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useToast } from "@/components/toast";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { ACTION_LABELS, GROUP_LABELS, WARNING_ACTIONS } from "@/lib/activity-groups";
import { toCsv } from "@/lib/csv";
import { useT } from "@/lib/i18n";

type Row = { _id: string; createdAt: string; userName?: string; role?: string; branchName?: string; action: string; summary: string; refType?: string; refId?: string; refNo?: string; amount?: number; ip?: string };
type Data = { rows: Row[]; users: { _id: string; name: string; role: string }[]; truncated: boolean };

const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", cashier: "Cashier", superadmin: "Admin" };

export default function ActivityPage() {
  const toast = useToast();
  const tr = useT();
  const [range, setRange] = useState({ from: todayISO(-6), to: todayISO() });
  const [user, setUser] = useState("");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(() => {
    api<Data>(`/api/activity?from=${range.from}&to=${range.to}&user=${user}&group=${group}&q=${encodeURIComponent(q)}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [range, user, group, q, toast]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const warn = (r: Row) => WARNING_ACTIONS.has(r.action) || (r.action === "drawer.close" && r.summary.includes("SHORT"));

  function exportCsv() {
    if (!data) return;
    // Shared helper: safe against spreadsheet formulas typed into names and notes.
    const csv = toCsv(
      ["Time", "Who", "Role", "Branch", "What", "Details", "Ref", "Amount"],
      data.rows.map((r) => [new Date(r.createdAt).toLocaleString("en-PK"), r.userName, r.role, r.branchName, ACTION_LABELS[r.action] ?? r.action, r.summary, r.refNo, r.amount]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `activity-${range.from}-to-${range.to}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Activity Log"
        urdu="سرگرمی"
        subtitle="Who changed prices, gave discounts, took returns, cancelled payments, adjusted stock or changed settings"
        actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!data?.rows.length}>Excel</Button>}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <Select value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 w-auto" aria-label="Type">
              <option value="">{tr("Everything")}</option>
              {Object.entries(GROUP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{tr(v)}</option>
              ))}
            </Select>
            <Select value={user} onChange={(e) => setUser(e.target.value)} className="h-10 w-auto" aria-label="Person">
              <option value="">{tr("All staff")}</option>
              {data?.users.map((u) => (
                <option key={u._id} value={u._id}>{u.name} ({tr(ROLE[u.role] ?? u.role)})</option>
              ))}
            </Select>
          </div>
          <div className="relative xl:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search bill no., item, name")} className="pl-10" />
          </div>
        </div>
        {!data ? (
          <Spinner />
        ) : data.rows.length === 0 ? (
          <EmptyState icon={<History className="h-8 w-8" />} title="Nothing recorded in this period" text="Discounts, price changes, returns, payments, stock changes, logins and settings changes appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Details</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r._id} className={warn(r) ? "bg-rose-50/40" : undefined}>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(r.createdAt, true)}</Td>
                  <Td>
                    <div className="font-medium text-slate-800">{r.userName}</div>
                    <div className="text-xs text-slate-400">
                      {tr(ROLE[r.role ?? ""] ?? r.role ?? "")}
                      {r.branchName && ` · ${r.branchName}`}
                    </div>
                  </Td>
                  <Td>
                    <Badge color={warn(r) ? "red" : r.action.startsWith("login") ? "slate" : "blue"}>{tr(ACTION_LABELS[r.action] ?? r.action)}</Badge>
                  </Td>
                  <Td className="max-w-[520px] whitespace-normal text-sm text-slate-700">
                    {r.summary}
                    {/* Open the bill, return, receipt, purchase… this entry is about. */}
                    {refLink(r.refType, r.refId) && (
                      <div className="mt-0.5">
                        <RefLink refType={r.refType} refId={r.refId} className="text-xs font-semibold text-brand-700 hover:underline">
                          {tr("Open {no}", { no: r.refNo ?? tr("record") })} →
                        </RefLink>
                      </div>
                    )}
                  </Td>
                  <Td className="text-right text-sm font-semibold">{r.amount ? formatPKR(r.amount) : ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data?.truncated && <p className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">{tr("Showing the latest 1,000 entries — choose a shorter period to see older ones.")}</p>}
      </Card>
    </div>
  );
}
