"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Badge, EmptyState, Modal, Spinner, Table, Td, Th } from "./ui";
import { useToast } from "./toast";
import { api, formatDate, UNIT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";
import { RefLink } from "./ref-link";

type Row = { _id: string; field: "salePrice" | "wholesalePrice" | "costPrice"; from: number | null; to: number | null; source: string; refNo?: string; refId?: string; userName?: string; at: string };
type Data = { product: { name: string; unit: string; salePrice: number; wholesalePrice?: number; costPrice?: number }; rows: Row[] };

const FIELD: Record<Row["field"], string> = { salePrice: "Sale price", wholesalePrice: "Wholesale price", costPrice: "Cost price" };
const SOURCE: Record<string, string> = { added: "New item", edit: "Changed by hand", purchase: "Purchase", import: "Imported (CSV)", bulk: "Bulk price update", production: "Production cost" };
const FIELD_COLOR = { salePrice: "green", wholesalePrice: "violet", costPrice: "slate" } as const;

/** Every price change of one item: when, which price, from → to, who, and why. */
export function PriceHistoryModal({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    if (!productId) return;
    setData(null);
    api<Data>(`/api/products/${productId}/price-history`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [productId, toast]);
  if (!productId) return null;
  const unit = data ? t(UNIT_LABELS[data.product.unit] ?? data.product.unit) : "";
  return (
    <Modal open onClose={onClose} title={data ? t("Price history — {name}", { name: data.product.name }) : "Price history"} size="lg">
      {!data ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            {t("Now")}: <b>{formatPKR(data.product.salePrice)}</b> / {unit}
            {data.product.wholesalePrice ? ` · ${t("Wholesale")} ${formatPKR(data.product.wholesalePrice)}` : ""}
            {data.product.costPrice !== undefined ? ` · ${t("Cost")} ${formatPKR(data.product.costPrice)}` : ""}
          </p>
          {data.rows.length === 0 ? (
            <EmptyState icon={<History className="h-8 w-8" />} title="No price changes yet" text="Every change of this item's prices will be listed here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Price</Th>
                  <Th className="text-right">Change</Th>
                  <Th>Why</Th>
                  <Th>By</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const diff = r.from != null && r.to != null ? r.to - r.from : null;
                  const pct = diff != null && r.from ? (diff / r.from) * 100 : null;
                  return (
                    <tr key={r._id}>
                      <Td className="whitespace-nowrap text-slate-600">{formatDate(r.at, true)}</Td>
                      <Td>
                        <Badge color={FIELD_COLOR[r.field]}>{FIELD[r.field]}</Badge>
                      </Td>
                      <Td className="text-right">
                        <span className="whitespace-nowrap">
                          {r.from != null ? <span className="text-slate-400 line-through">{formatPKR(r.from)}</span> : null} <b>{r.to != null ? formatPKR(r.to) : "—"}</b>
                        </span>
                        {pct != null && Math.abs(pct) >= 0.05 && (
                          <div className={diff! > 0 ? "text-xs font-semibold text-rose-600" : "text-xs font-semibold text-emerald-700"}>
                            {diff! > 0 ? "+" : "−"}
                            {formatPKR(Math.abs(diff!))} ({diff! > 0 ? "+" : "−"}
                            {Math.abs(pct).toFixed(1)}%)
                          </div>
                        )}
                      </Td>
                      <Td className="text-slate-600">
                        {t(SOURCE[r.source] ?? r.source)}
                        {r.refNo && (
                          <>
                            {" · "}
                            <RefLink refType={r.source === "purchase" ? "purchase" : r.source === "production" ? "production" : null} refId={r.refId}>
                              {r.refNo}
                            </RefLink>
                          </>
                        )}
                      </Td>
                      <Td className="text-slate-600">{r.userName ?? "—"}</Td>
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
