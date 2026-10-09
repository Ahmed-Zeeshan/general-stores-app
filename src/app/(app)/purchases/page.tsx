"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PackagePlus, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useToast } from "@/components/toast";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";

type Purchase = { _id: string; purchaseNo: string; supplierName?: string; supplierInvoice?: string; items: unknown[]; total: number; amountPaid: number; createdAt: string };

export default function PurchasesPage() {
  const toast = useToast();
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [list, setList] = useState<Purchase[] | null>(null);

  const load = useCallback(() => {
    api<Purchase[]>(`/api/purchases?from=${range.from}&to=${range.to}`).then(setList).catch((e) => toast.error(e.message));
  }, [range, toast]);
  useEffect(load, [load]);

  const total = list?.reduce((s, p) => s + p.total, 0) ?? 0;
  const unpaid = list?.reduce((s, p) => s + (p.total - p.amountPaid), 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Purchases"
        urdu="خریداری"
        subtitle="Stock you bought from suppliers"
        actions={
          <Link href="/purchases/new">
            <Button icon={<Plus className="h-4 w-4" />}>New purchase</Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Total purchased" value={formatPKR(total)} icon={<PackagePlus className="h-5 w-5" />} tone="violet" />
        <StatCard label="Not yet paid" value={formatPKR(unpaid)} icon={<PackagePlus className="h-5 w-5" />} tone="rose" />
      </div>
      <Card>
        <div className="border-b border-slate-100 p-4">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
        </div>
        {!list ? (
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
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p._id}>
                  <Td>
                    <div className="font-semibold text-slate-800">{p.purchaseNo}</div>
                    <div className="text-xs text-slate-400">{p.items.length} items{p.supplierInvoice && ` · Inv ${p.supplierInvoice}`}</div>
                  </Td>
                  <Td className="text-slate-500">{formatDate(p.createdAt, true)}</Td>
                  <Td>{p.supplierName ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-right font-bold">{formatPKR(p.total)}</Td>
                  <Td className="text-right">
                    {p.amountPaid >= p.total ? <Badge color="green">Paid</Badge> : <Badge color="amber">{formatPKR(p.amountPaid)}</Badge>}
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
