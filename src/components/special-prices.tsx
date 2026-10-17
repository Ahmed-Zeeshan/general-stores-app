"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Tag, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Input, Spinner, Table, Td, Th } from "./ui";
import { useCan } from "./session";
import { useToast } from "./toast";
import { api, UNIT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Row = { productId: string; name: string; nameUrdu?: string; unit: string; salePrice: number; wholesalePrice?: number; active?: boolean; price: number | string };
type Found = { _id: string; name: string; nameUrdu?: string; unit: string; salePrice: number; wholesalePrice?: number; trackSerial?: boolean };

/**
 * A customer's own prices: on every bill for this customer these items come in at this price (before
 * wholesale and normal prices). Owner / manager change them; everyone can see them.
 */
export function SpecialPrices({ partyId, name }: { partyId: string; name: string }) {
  const t = useT();
  const toast = useToast();
  const can = useCan();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<Row[]>(`/api/parties/${partyId}/prices`)
      .then((r) => {
        setRows(r);
        setSaved(JSON.stringify(r.map((x) => [x.productId, Number(x.price)])));
      })
      .catch((e) => toast.error(e.message));
  }, [partyId, toast]);
  useEffect(load, [load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setFound([]);
    const timer = setTimeout(() => {
      api<Found[]>(`/api/products?q=${encodeURIComponent(term)}&limit=20`)
        .then((list) => setFound(list.filter((p) => !p.trackSerial)))
        .catch(() => setFound([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  if (!rows) return <Spinner />;
  const dirty = JSON.stringify(rows.map((x) => [x.productId, Number(x.price)])) !== saved;
  const bad = rows.some((x) => !(Number(x.price) > 0));

  function add(p: Found) {
    setRows((r) => [...(r ?? []), { productId: p._id, name: p.name, nameUrdu: p.nameUrdu, unit: p.unit, salePrice: p.salePrice, wholesalePrice: p.wholesalePrice, price: p.salePrice }]);
    setQ("");
    setFound([]);
  }
  async function save() {
    setSaving(true);
    try {
      await api(`/api/parties/${partyId}/prices`, { method: "PUT", body: { prices: rows!.map((x) => ({ productId: x.productId, price: Number(x.price) })) } });
      toast.success(t("Special prices saved"));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const have = new Set(rows.map((x) => x.productId));
  return (
    <Card>
      <div className="border-b border-slate-100 p-4">
        <p className="text-sm text-slate-600">{t("Items {name} always gets at their own price. On a bill for {name} these prices come in by themselves — before wholesale and normal prices.", { name })}</p>
        {can.manage && (
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Add an item: type its name or scan the barcode")} aria-label="Add special price item" className="pl-10" />
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {found.map((p) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      disabled={have.has(p._id)}
                      onClick={() => add(p)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 disabled:opacity-40"
                    >
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="text-slate-500">
                        {formatPKR(p.salePrice)} / {t(UNIT_LABELS[p.unit] ?? p.unit)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Tag className="h-8 w-8" />} title="No special prices" text={can.manage ? "Add the items this customer gets at a different price." : "This customer pays the normal prices."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="text-right">Normal price</Th>
              <Th className="text-right">Special price</Th>
              {can.manage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => {
              const unit = t(UNIT_LABELS[x.unit] ?? x.unit);
              const n = Number(x.price);
              return (
                <tr key={x.productId}>
                  <Td>
                    <span className="font-semibold text-slate-800">{x.name}</span>
                    {x.active === false && <span className="ml-2 text-xs text-slate-400">({t("removed")})</span>}
                  </Td>
                  <Td className="text-right text-slate-500">
                    {formatPKR(x.salePrice)} / {unit}
                  </Td>
                  <Td className="text-right">
                    {can.manage ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={x.price}
                          onChange={(e) => setRows((r) => r!.map((y, k) => (k === i ? { ...y, price: e.target.value } : y)))}
                          aria-label={`Special price for ${x.name}`}
                          className="h-9 w-24 text-right font-semibold"
                        />
                        <span className="text-xs text-slate-500">/ {unit}</span>
                      </span>
                    ) : (
                      <b>
                        {formatPKR(n)} / {unit}
                      </b>
                    )}
                    {n > 0 && n !== x.salePrice && (
                      <div className={n < x.salePrice ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>
                        {n < x.salePrice ? t("{amount} less", { amount: formatPKR(x.salePrice - n) }) : t("{amount} more", { amount: formatPKR(n - x.salePrice) })}
                      </div>
                    )}
                  </Td>
                  {can.manage && (
                    <Td className="text-right">
                      <button type="button" onClick={() => setRows((r) => r!.filter((_, k) => k !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${x.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {can.manage && (dirty || rows.length > 0) && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
          {dirty && <span className="mr-auto text-xs font-semibold text-amber-700">{t("Not saved yet")}</span>}
          {dirty && (
            <Button variant="outline" onClick={load}>
              Cancel
            </Button>
          )}
          <Button icon={<Plus className="h-4 w-4" />} disabled={!dirty || bad} loading={saving} onClick={save}>
            Save special prices
          </Button>
        </div>
      )}
    </Card>
  );
}
