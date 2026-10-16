"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, MessageCircle, Printer, Truck } from "lucide-react";
import { Badge, Button, Card, Count, EmptyState, Input, PageHeader, Segmented, Spinner, Table, Td, Th } from "@/components/ui";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";
import { openWhatsApp, orderMessage, waNumber } from "@/lib/whatsapp";
import type { ReorderGroup } from "@/lib/reorder";

/** What to order from each supplier, from how fast each item sells. */
export default function ReorderPage() {
  const toast = useToast();
  const { settings, branch } = useSession();
  const [days, setDays] = useState("14");
  const [groups, setGroups] = useState<ReorderGroup[] | null>(null);
  // Quantities the owner changed by hand, per product.
  const [qty, setQty] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    setGroups(null);
    api<{ groups: ReorderGroup[] }>(`/api/reorder?days=${days}`)
      .then((r) => {
        setGroups(r.groups);
        setQty({});
      })
      .catch((e) => toast.error(e.message));
  }, [days, toast]);
  useEffect(load, [load]);

  const q = (id: string, suggest: number) => (qty[id] !== undefined ? Number(qty[id]) || 0 : suggest);
  function send(g: ReorderGroup) {
    const phone = waNumber(g.supplier?.phone);
    if (!phone) return toast.error("This supplier has no valid mobile number. Add it on the supplier's page.");
    const rows = g.rows.filter((r) => q(r.productId, r.suggest) > 0).map((r) => ({ name: r.name, qty: q(r.productId, r.suggest), unit: UNIT_LABELS[r.unit] ?? r.unit }));
    if (!rows.length) return toast.error("Nothing to order in this list.");
    openWhatsApp(phone, orderMessage({ shop: settings?.shopName ?? "", shopPhone: settings?.phone, supplier: g.supplier?.name, rows }));
  }

  const total = groups?.reduce((a, g) => a + g.rows.reduce((b, r) => b + q(r.productId, r.suggest) * r.lastCost, 0), 0) ?? 0;
  return (
    <div>
      <PageHeader
        title="Reorder List"
        urdu="آرڈر لسٹ"
        subtitle={`What to buy before it runs out${branch?.name ? ` · ${branch.name}` : ""} — from the last 30 days of sales`}
        actions={
          <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-600">Order enough for</span>
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "1 week" },
            { value: "14", label: "2 weeks" },
            { value: "30", label: "1 month" },
          ]}
        />
        {groups && groups.length > 0 && <span className="text-sm text-slate-500">About {formatPKR(total)} in all (last purchase prices)</span>}
      </div>
      {!groups ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList className="h-7 w-7" />} title="Nothing to order" text="Every item has enough stock for the days chosen." />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g.supplier?._id ?? "none"}>
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-brand-600" />
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {g.supplier ? (
                        <Link href={`/suppliers/${g.supplier._id}`} className="hover:underline">
                          {g.supplier.name}
                        </Link>
                      ) : (
                        "No supplier yet"
                      )}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {g.rows.length} item{g.rows.length > 1 ? "s" : ""} · about {formatPKR(g.rows.reduce((b, r) => b + q(r.productId, r.suggest) * r.lastCost, 0))}
                      {g.supplier?.phone && ` · ${g.supplier.phone}`}
                    </p>
                  </div>
                </div>
                {g.supplier && (
                  <Button size="sm" variant="outline" className="no-print" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => send(g)}>
                    WhatsApp order
                  </Button>
                )}
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th className="text-right">Stock</Th>
                    <Th className="text-right">Sells / day</Th>
                    <Th>Lasts</Th>
                    <Th className="text-right">Order</Th>
                    <Th className="text-right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.productId}>
                      <Td className="font-semibold text-slate-800">{r.name}</Td>
                      <Td className="text-right">
                        {formatQty(r.stock)} {UNIT_LABELS[r.unit] ?? r.unit}
                      </Td>
                      <Td className="text-right">{r.perDay ? formatQty(r.perDay) : "—"}</Td>
                      <Td>
                        {r.reason === "low" ? (
                          <Badge color="amber">Below alert level</Badge>
                        ) : r.daysLeft === 0 ? (
                          <Badge color="red">Out now</Badge>
                        ) : (
                          <Badge color={(r.daysLeft ?? 99) <= 3 ? "red" : "amber"}><Count n={r.daysLeft ?? 0} one="{n} day" many="{n} days" /></Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        <Input
                          type="number"
                          min="0"
                          inputMode="decimal"
                          value={qty[r.productId] ?? String(r.suggest)}
                          onChange={(e) => setQty({ ...qty, [r.productId]: e.target.value })}
                          className="ml-auto h-9 w-24 text-right"
                          aria-label={`Order ${r.name}`}
                        />
                      </Td>
                      <Td className="text-right">{formatPKR(q(r.productId, r.suggest) * r.lastCost)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
          <p className="text-xs text-slate-500">
            The order covers the days chosen at the speed each item sold in the last 30 days. Items that didn&apos;t sell show only when they are at their low-stock level. Change any quantity before sending.
          </p>
        </div>
      )}
    </div>
  );
}
