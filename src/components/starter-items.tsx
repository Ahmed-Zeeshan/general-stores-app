"use client";

import { useEffect, useMemo, useState } from "react";
import { ListPlus, Search } from "lucide-react";
import { Button, Input, Modal, Spinner, cn } from "./ui";
import { useToast } from "./toast";
import { api, UNIT_LABELS } from "@/lib/client";
import type { StarterItem } from "@/lib/starter-items";

type Row = StarterItem & { exists: boolean };
type Entry = { on: boolean; sale: string; cost: string; stock: string };

/** Ready-made item list for the shop type: tick the items you sell, type your prices, add them all at once. */
export function StarterItemsModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (n: number) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    setEntries({});
    setQ("");
    api<Row[]>("/api/starter-items")
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, [open, toast]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !q.trim() || `${r.name} ${r.nameUrdu ?? ""} ${r.category}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return [...m.entries()];
  }, [shown]);
  const e = (name: string): Entry => entries[name] ?? { on: false, sale: "", cost: "", stock: "" };
  const set = (name: string, patch: Partial<Entry>) => setEntries((x) => ({ ...x, [name]: { ...e(name), ...patch } }));
  const chosen = (rows ?? []).filter((r) => !r.exists && e(r.name).on);
  const missingPrice = chosen.filter((r) => !(Number(e(r.name).sale) > 0));

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ created: number; skipped: string[] }>("/api/starter-items", {
        body: {
          items: chosen.map((i) => ({
            name: i.name,
            nameUrdu: i.nameUrdu,
            unit: i.unit,
            category: i.category,
            salePrice: Number(e(i.name).sale),
            costPrice: Number(e(i.name).cost) || 0,
            openingStock: Number(e(i.name).stock) || 0,
          })),
        },
      });
      toast.success(`${r.created} item${r.created === 1 ? "" : "s"} added`);
      onAdded(r.created);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add ready-made items"
      size="xl"
      footer={
        <>
          {missingPrice.length > 0 && <span className="mr-auto self-center text-sm text-rose-600">Type the sale price for {missingPrice.length} ticked item{missingPrice.length > 1 ? "s" : ""}</span>}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!chosen.length || missingPrice.length > 0} icon={<ListPlus className="h-4 w-4" />} onClick={save}>
            Add {chosen.length || ""} items
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">Tick what you sell and type your own price — the list has no prices because they change. Cost and stock are optional; you can add more items any time.</p>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Find an item…" className="pl-9" aria-label="Find an item" />
      </div>
      {!rows ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          {groups.map(([cat, list]) => (
            <section key={cat}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{cat}</h3>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {list.map((r) => {
                  const x = e(r.name);
                  return (
                    <div key={r.name} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2", r.exists && "opacity-50")}>
                      <label className="flex min-w-0 flex-1 basis-48 cursor-pointer items-center gap-3">
                        <input type="checkbox" disabled={r.exists} checked={!r.exists && x.on} onChange={(ev) => set(r.name, { on: ev.target.checked })} className="h-5 w-5 shrink-0 accent-brand-600" aria-label={`Sell ${r.name}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-800">{r.name}</span>
                          <span className="block text-xs text-slate-500">
                            {r.nameUrdu && <span className="urdu mr-2">{r.nameUrdu}</span>}
                            {r.exists ? "already added" : `per ${UNIT_LABELS[r.unit] ?? r.unit}`}
                          </span>
                        </span>
                      </label>
                      {!r.exists && (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={x.sale}
                            onChange={(ev) => set(r.name, { sale: ev.target.value, on: ev.target.value !== "" || x.on })}
                            placeholder="Sale Rs"
                            className="h-9 w-24 text-sm"
                            aria-label={`${r.name} sale price`}
                          />
                          <Input type="number" inputMode="decimal" min="0" value={x.cost} onChange={(ev) => set(r.name, { cost: ev.target.value })} placeholder="Cost" className="h-9 w-20 text-sm" aria-label={`${r.name} cost price`} />
                          <Input type="number" inputMode="decimal" min="0" value={x.stock} onChange={(ev) => set(r.name, { stock: ev.target.value })} placeholder="Stock" className="h-9 w-20 text-sm" aria-label={`${r.name} stock`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
