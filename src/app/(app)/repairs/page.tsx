"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, CheckCircle2, Plus, Search, Wrench } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { NewRepairModal, RepairStatusBadge, isLate, type RepairJob } from "@/components/repairs";
import { useToast } from "@/components/toast";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { REPAIR_STATUS_LABELS, type RepairStatus } from "@/lib/constants";

type Tab = "open" | RepairStatus | "all";
const OPEN_STEPS: RepairStatus[] = ["received", "checking", "waiting_parts", "repairing", "ready"];

export default function RepairsPage() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [data, setData] = useState<{ rows: RepairJob[]; counts: Record<string, number> } | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams({ status: tab });
    if (q.trim()) p.set("q", q.trim());
    if (tab === "delivered" || tab === "cancelled" || tab === "all") {
      p.set("from", range.from);
      p.set("to", range.to);
    }
    api<{ rows: RepairJob[]; counts: Record<string, number> }>(`/api/repairs?${p}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [tab, q, range, toast]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const counts = data?.counts ?? {};
  const open = OPEN_STEPS.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const rows = data?.rows ?? [];
  const late = tab === "open" ? rows.filter(isLate).length : null;

  return (
    <div>
      <PageHeader
        title="Repairs"
        urdu="مرمت"
        subtitle="Job cards for phones in for repair: status, parts, charges and pickup"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
            New repair job
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Phones in the shop" value={open} icon={<Wrench className="h-5 w-5" />} hint="Not delivered yet" />
        <StatCard label="Ready to collect" value={counts.ready ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint="Send them a WhatsApp" />
        <StatCard label="Late" value={late ?? "—"} icon={<AlarmClock className="h-5 w-5" />} tone="rose" hint="Past the promised date, not ready" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "open", label: `In shop (${open})` },
              ...OPEN_STEPS.map((s) => ({ value: s, label: `${REPAIR_STATUS_LABELS[s]}${counts[s] ? ` (${counts[s]})` : ""}` })),
              { value: "delivered", label: "Delivered" },
              { value: "cancelled", label: "Cancelled" },
              { value: "all", label: "All" },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {(tab === "delivered" || tab === "cancelled" || tab === "all") && <DateRange from={range.from} to={range.to} onChange={setRange} />}
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job no, name, mobile, IMEI…" className="pl-9" aria-label="Search repairs" />
            </div>
          </div>
        </div>
        {!data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wrench className="h-7 w-7" />} title="No repair jobs here" text={tab === "open" ? "Book a phone in with “New repair job”." : "Try another tab or search."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Customer</Th>
                <Th>Phone & problem</Th>
                <Th>Status</Th>
                <Th>Ready by</Th>
                <Th className="text-right">Bill / to pay</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const toPay = Math.max(0, j.total - j.paid - (j.creditAmount ?? 0));
                return (
                  <tr key={j._id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => router.push(`/repairs/${j._id}`)}>
                    <Td>
                      <div className="font-semibold text-slate-800">{j.jobNo}</div>
                      <div className="text-xs text-slate-500">{formatDate(j.createdAt)}</div>
                    </Td>
                    <Td>
                      <div>{j.customerName}</div>
                      <div className="text-xs text-slate-500">{j.customerPhone}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold text-slate-800">{j.deviceName}</div>
                      <div className="max-w-xs truncate text-xs text-slate-500">{j.problem}</div>
                    </Td>
                    <Td>
                      <RepairStatusBadge status={j.status} />
                      {j.warrantyOf && <div className="mt-0.5"><Badge color="violet">Warranty</Badge></div>}
                      {j.technicianName && <div className="text-xs text-slate-500">{j.technicianName}</div>}
                    </Td>
                    <Td>
                      {j.promisedAt ? <span className={isLate(j) ? "font-semibold text-rose-600" : "text-slate-600"}>{formatDate(j.promisedAt)}</span> : "—"}
                      {isLate(j) && <div className="text-xs font-semibold text-rose-600">Late</div>}
                    </Td>
                    <Td className="text-right">
                      <div className="font-semibold">{j.total ? formatPKR(j.total) : j.estimate ? `~${formatPKR(j.estimate)}` : "—"}</div>
                      {toPay > 0 && j.status !== "cancelled" && <div className="text-xs font-semibold text-amber-700">{formatPKR(toPay)} to pay</div>}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/repairs/${j._id}`} onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost">Open</Button>
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <NewRepairModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={(job) => {
          setNewOpen(false);
          window.open(`/receipt/repair/${job._id}?print=1`, "_blank");
          router.push(`/repairs/${job._id}`);
        }}
      />
    </div>
  );
}
