"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, Printer, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { BranchFilter } from "@/components/branch-filter";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";

type Row = {
  _id: string;
  kind: "batch" | "product";
  name: string;
  unit: string;
  branchName: string;
  qty: number;
  expiryDate: string;
  daysLeft: number;
  batchNo?: string;
  refNo?: string;
  value: number;
};
type Data = { rows: Row[]; summary: Record<"expired" | "week" | "month", { count: number; value: number }> };

export default function ExpiryPageWrapper() {
  return (
    <Suspense fallback={<Spinner />}>
      <ExpiryPage />
    </Suspense>
  );
}

function when(days: number) {
  if (days < 0) return <Badge color="red">Expired {-days === 1 ? "yesterday" : `${-days} days ago`}</Badge>;
  if (days === 0) return <Badge color="red">Expires today</Badge>;
  if (days <= 7) return <Badge color="amber">{days === 1 ? "Tomorrow" : `In ${days} days`}</Badge>;
  return <Badge color="slate">In {days} days</Badge>;
}

function ExpiryPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const params = useSearchParams();
  const [within, setWithin] = useState(params.get("within") ?? "30");
  const [branch, setBranch] = useState("");
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(() => {
    setData(null);
    api<Data>(`/api/expiry?within=${within}&branch=${branch}`).then(setData).catch((e) => toast.error(e.message));
  }, [within, branch, toast]);
  useEffect(load, [load]);

  async function writeOff(r: Row) {
    const ok = await confirm({
      title: `Throw away ${r.name}?`,
      message: "The stock of this lot is removed as wastage and shows in the product's stock history.",
      details: [
        { label: "Lot", value: [r.batchNo, r.refNo].filter(Boolean).join(" · ") || "—" },
        { label: "Expiry", value: formatDate(r.expiryDate) },
        { label: "Quantity", value: `${formatQty(r.qty)} ${UNIT_LABELS[r.unit] ?? r.unit}` },
        { label: "Value at cost", value: formatPKR(r.value), strong: true },
      ],
      tone: "danger",
      icon: "delete",
      confirmLabel: "Write off",
    });
    if (!ok) return;
    try {
      await api(`/api/expiry/${r._id}/write-off`, { body: {} });
      toast.success(`${r.name} written off`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const s = data?.summary;
  return (
    <div>
      <PageHeader
        title="Expiry"
        urdu="میعاد"
        subtitle="Lots that have expired or will expire soon — sell these first or send them back"
        actions={<Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Already expired" value={formatPKR(s?.expired.value ?? 0)} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" hint={`${s?.expired.count ?? 0} lots — remove from shelves`} />
        <StatCard label="Expire within 7 days" value={formatPKR(s?.week.value ?? 0)} icon={<CalendarClock className="h-5 w-5" />} tone="amber" hint={`${s?.week.count ?? 0} lots — put in front / discount`} />
        <StatCard label="Expire in 8–30 days" value={formatPKR(s?.month.value ?? 0)} icon={<CalendarClock className="h-5 w-5" />} tone="blue" hint={`${s?.month.count ?? 0} lots`} />
      </div>
      <Card>
        <div className="no-print flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Segmented
            value={within}
            onChange={setWithin}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "all", label: "All dates" },
            ]}
          />
          <BranchFilter value={branch} onChange={setBranch} />
          <p className="text-xs text-slate-500">Expired lots are always shown. Values are at cost price.</p>
        </div>
        {!data ? (
          <Spinner />
        ) : data.rows.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="Nothing expires in this period" text={`Turn on "Track expiry by batch" for items like dairy, bakery and medicines, and enter expiry dates when stock arrives.`} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Lot</Th>
                <Th className="text-right">Quantity</Th>
                <Th>Expiry</Th>
                <Th className="text-right">Value</Th>
                <Th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.kind}:${r._id}`} className={r.daysLeft < 0 ? "bg-rose-50/40" : undefined}>
                  <Td>
                    <div className="font-semibold text-slate-800">{r.name}</div>
                    {r.branchName && branch === "all" && <div className="text-xs text-slate-400">{r.branchName}</div>}
                  </Td>
                  <Td className="text-sm text-slate-500">
                    {r.kind === "product" ? <span className="text-slate-400">Single expiry date</span> : [r.batchNo && `Batch ${r.batchNo}`, r.refNo].filter(Boolean).join(" · ") || "—"}
                  </Td>
                  <Td className="text-right font-semibold">
                    {formatQty(r.qty)} {UNIT_LABELS[r.unit] ?? r.unit}
                  </Td>
                  <Td>
                    <div className="text-sm text-slate-600">{formatDate(r.expiryDate)}</div>
                    {when(r.daysLeft)}
                  </Td>
                  <Td className="text-right">{formatPKR(r.value)}</Td>
                  <Td className="no-print text-right">
                    {r.kind === "batch" && (
                      <Button size="sm" variant="ghost" className="hover:text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => writeOff(r)}>
                        Write off
                      </Button>
                    )}
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
