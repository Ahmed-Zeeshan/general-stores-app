"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { Badge, Card, EmptyState, Segmented, Spinner, Table, Td, Th } from "./ui";
import { useToast } from "./toast";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Purchase = { _id: string; purchaseNo: string; supplierInvoice?: string; createdAt: string; total: number; amountPaid: number; returnedTotal?: number; status?: string; items: unknown[] };
type PReturn = { _id: string; returnNo: string; purchase: string; purchaseNo: string; createdAt: string; total: number; settlement: "khata" | "cash" };

/** A supplier's page: their khata, and every purchase and return to them (each opens the purchase). */
export function SupplierTabs({ supplierId, khata }: { supplierId: string; khata: React.ReactNode }) {
  const t = useT();
  const toast = useToast();
  const [tab, setTab] = useState<"khata" | "purchases">("khata");
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [returns, setReturns] = useState<PReturn[] | null>(null);
  useEffect(() => {
    const qs = `supplier=${supplierId}&from=2000-01-01&to=2100-12-31&branch=all`;
    api<Purchase[]>(`/api/purchases?${qs}`).then(setPurchases).catch((e) => toast.error(e.message));
    api<PReturn[]>(`/api/purchase-returns?${qs}`).then(setReturns).catch(() => setReturns([]));
  }, [supplierId, toast]);
  const active = purchases?.filter((p) => p.status !== "void") ?? [];
  return (
    <div className="mt-6">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "khata", label: "Khata" },
          { value: "purchases", label: `Purchases${purchases ? ` (${active.length})` : ""}` },
        ]}
      />
      <div className="mt-4">
        {tab === "khata" ? (
          khata
        ) : !purchases ? (
          <Spinner />
        ) : purchases.length === 0 ? (
          <Card>
            <EmptyState icon={<PackagePlus className="h-8 w-8" />} title="No purchases from this supplier yet" action={<Link href="/purchases/new" className="text-sm font-semibold text-brand-700">{t("Record a purchase")}</Link>} />
          </Card>
        ) : (
          <Card>
            <div className="border-b border-slate-100 p-4 text-sm text-slate-600">
              {t("Bought in total")}: <b>{formatPKR(active.reduce((a, p) => a + p.total, 0))}</b>
              {(returns?.length ?? 0) > 0 && <> · {t("Returned")}: <b>{formatPKR(returns!.reduce((a, r) => a + r.total, 0))}</b></>}
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Purchase</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Paid at purchase</Th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p._id} className={p.status === "void" ? "opacity-60" : undefined}>
                    <Td>
                      <Link href={`/purchases?id=${p._id}`} className="font-semibold text-brand-700 hover:underline">{p.purchaseNo}</Link>
                      {p.supplierInvoice && <div className="text-xs text-slate-400">{t("Inv {no}", { no: p.supplierInvoice })}</div>}
                    </Td>
                    <Td className="text-slate-500">{formatDate(p.createdAt, true)}</Td>
                    <Td className="text-right font-semibold">
                      {formatPKR(p.total)}
                      {(p.returnedTotal ?? 0) > 0 && <div className="text-xs text-amber-700">−{formatPKR(p.returnedTotal!)}</div>}
                    </Td>
                    <Td className="text-right">{p.status === "void" ? <Badge color="red">Cancelled</Badge> : formatPKR(p.amountPaid)}</Td>
                  </tr>
                ))}
                {(returns ?? []).map((r) => (
                  <tr key={r._id} className="bg-amber-50/40">
                    <Td>
                      <span className="font-semibold text-slate-800">{r.returnNo}</span>
                      <div className="text-xs text-slate-500">
                        <Link href={`/purchases?id=${r.purchase}`} className="hover:text-brand-700 hover:underline">{t("from {no}", { no: r.purchaseNo })}</Link>
                      </div>
                    </Td>
                    <Td className="text-slate-500">{formatDate(r.createdAt, true)}</Td>
                    <Td className="text-right font-semibold text-amber-700">−{formatPKR(r.total)}</Td>
                    <Td className="text-right">{r.settlement === "khata" ? <Badge color="blue">Less in khata</Badge> : <Badge color="green">Cash back</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
