"use client";

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { Badge, EmptyState, Modal, Spinner, Table, Td, Th } from "./ui";
import { RefLink } from "./ref-link";
import { useToast } from "./toast";
import { api, formatDate, UNIT_LABELS } from "@/lib/client";
import { formatQty } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Movement = { _id: string; type: string; qty: number; stockAfter?: number; refNo?: string; refType?: string; refId?: string; note?: string; userName?: string; createdAt: string };
type Data = { product: { name: string; unit: string; stock: number }; movements: Movement[] };

const TYPE: Record<string, { label: string; color: "green" | "red" | "blue" | "amber" | "violet" | "slate" }> = {
  sale: { label: "Sold", color: "blue" },
  return: { label: "Customer return", color: "green" },
  purchase: { label: "Purchase", color: "green" },
  purchase_return: { label: "Returned to supplier", color: "amber" },
  void: { label: "Cancelled", color: "red" },
  adjustment: { label: "Adjusted by hand", color: "slate" },
  wastage: { label: "Wastage / expired", color: "red" },
  opening: { label: "Opening stock", color: "slate" },
  import: { label: "Imported (CSV)", color: "slate" },
  production: { label: "Production", color: "violet" },
  transfer: { label: "Branch transfer", color: "violet" },
  used_buy: { label: "Used phone bought", color: "green" },
  repair: { label: "Repair part", color: "amber" },
  repossess: { label: "Taken back (installment)", color: "amber" },
};

/** The stock card of one item: every change at this branch, newest first, each opening its bill / purchase / return. */
export function StockHistoryModal({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    if (!productId) return;
    setData(null);
    api<Data>(`/api/products/${productId}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [productId, toast]);
  if (!productId) return null;
  const unit = data ? t(UNIT_LABELS[data.product.unit] ?? data.product.unit) : "";
  return (
    <Modal open onClose={onClose} title={data ? t("Stock history — {name}", { name: data.product.name }) : "Stock history"} size="lg">
      {!data ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            {t("In stock now")}: <b>{formatQty(data.product.stock)} {unit}</b> · {t("last {n} changes at this branch", { n: data.movements.length })}
          </p>
          {data.movements.length === 0 ? (
            <EmptyState icon={<Boxes className="h-8 w-8" />} title="No stock changes yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>What</Th>
                  <Th className="text-right">Change</Th>
                  <Th className="text-right">Stock after</Th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => {
                  const ty = TYPE[m.type] ?? { label: m.type, color: "slate" as const };
                  return (
                    <tr key={m._id}>
                      <Td className="whitespace-nowrap text-slate-600">{formatDate(m.createdAt, true)}</Td>
                      <Td>
                        <Badge color={ty.color}>{t(ty.label)}</Badge>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {m.refNo && (
                            <RefLink refType={m.refType} refId={m.refId}>
                              {m.refNo}
                            </RefLink>
                          )}
                          {m.note && <span>{m.refNo ? " · " : ""}{m.note}</span>}
                          {m.userName && <span> · {t("by {name}", { name: m.userName })}</span>}
                        </div>
                      </Td>
                      <Td className={m.qty > 0 ? "text-right font-semibold text-emerald-700" : "text-right font-semibold text-rose-600"}>
                        {m.qty > 0 ? "+" : "−"}
                        {formatQty(Math.abs(m.qty))}
                      </Td>
                      <Td className="text-right text-slate-700">{m.stockAfter !== undefined ? formatQty(m.stockAfter) : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Modal>
  );
}
