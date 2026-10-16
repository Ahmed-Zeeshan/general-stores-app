"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td, Th, cn } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { isRunning, type PromoLike } from "@/lib/promotions";
import { useT } from "@/lib/i18n";

type Promo = PromoLike & { createdAt: string };
type Product = { _id: string; name: string };
type Category = { _id: string; name: string };

const KINDS = [
  { value: "percent", label: "% off items" },
  { value: "amount", label: "Rs off each" },
  { value: "bxgy", label: "Buy X get Y free" },
  { value: "bill", label: "Off the bill" },
] as const;

function describe(p: PromoLike, t: ReturnType<typeof useT>) {
  if (p.kind === "percent") return t("{n}% off", { n: String(p.value) });
  if (p.kind === "amount") return t("{amount} off each", { amount: formatPKR(p.value ?? 0) });
  if (p.kind === "bxgy") return t("Buy {buy} get {free} free", { buy: String(p.buyQty), free: String(p.freeQty) });
  const off = t("{discount} off bills of {min} or more", { discount: p.billMode === "amount" ? formatPKR(p.value ?? 0) : `${p.value}%`, min: formatPKR(p.minAmount ?? 0) });
  return `${off}${p.maxDiscount ? ` (${t("up to {amount}", { amount: formatPKR(p.maxDiscount) })})` : ""}`;
}

export default function PromotionsPage() {
  const toast = useToast();
  const t = useT();
  const confirm = useConfirm();
  const [list, setList] = useState<Promo[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Promo | "new" | null>(null);

  const load = useCallback(() => {
    api<Promo[]>("/api/promotions").then(setList).catch((e) => toast.error(e.message));
  }, [toast]);
  useEffect(() => {
    load();
    api<Product[]>("/api/products?limit=5000").then(setProducts).catch(() => {});
    api<Category[]>("/api/categories").then(setCategories).catch(() => {});
  }, [load]);

  const names = useMemo(() => new Map([...products, ...categories].map((x) => [x._id, x.name])), [products, categories]);
  const scope = (p: PromoLike) =>
    p.kind === "bill" ? t("Whole bill") : p.appliesTo === "products" ? (p.products ?? []).map((id) => names.get(String(id)) ?? "…").join(", ") : p.appliesTo === "categories" ? `${t("Category:")} ${(p.categories ?? []).map((id) => names.get(String(id)) ?? "…").join(", ")}` : t("All items");

  async function toggle(p: Promo) {
    try {
      await api(`/api/promotions/${p._id}`, { method: "PUT", body: { ...p, products: (p.products ?? []).map(String), categories: (p.categories ?? []).map(String), startsAt: p.startsAt ? String(p.startsAt).slice(0, 10) : "", endsAt: p.endsAt ? String(p.endsAt).slice(0, 10) : "", active: !p.active } });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(p: Promo) {
    if (!(await confirm({ title: t('Delete offer "{name}"?', { name: p.name }), message: t("Bills already made keep their discount."), tone: "danger", icon: "delete", confirmLabel: "Delete offer" }))) return;
    try {
      await api(`/api/promotions/${p._id}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Offers"
        urdu="آفرز"
        subtitle="Discounts that apply automatically at the counter — % off, Rs off, buy X get Y free, or off the whole bill"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>New offer</Button>}
      />
      <Card>
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState icon={<BadgePercent className="h-8 w-8" />} title="No offers yet" text="Create an offer like “10% off all biscuits” or “Buy 2 soaps get 1 free”. It is applied on every bill automatically." action={<Button onClick={() => setEditing("new")}>Create an offer</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Offer</Th>
                <Th>On</Th>
                <Th>When</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const running = isRunning(p);
                return (
                  <tr key={p._id}>
                    <Td>
                      <div className="font-semibold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-500">{describe(p, t)}</div>
                    </Td>
                    <Td className="max-w-[260px] whitespace-normal text-sm text-slate-600">{scope(p)}</Td>
                    <Td className="text-sm text-slate-500">
                      {p.startsAt ? formatDate(String(p.startsAt)) : t("Now")} – {p.endsAt ? formatDate(String(p.endsAt)) : t("no end")}
                    </Td>
                    <Td>
                      <button onClick={() => toggle(p)} title={t("Switch on / off")}>
                        {!p.active ? <Badge color="slate">Off</Badge> : running ? <Badge color="green">Running</Badge> : <Badge color="amber">Scheduled / ended</Badge>}
                      </button>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(p)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="hover:text-rose-600" aria-label={`Delete ${p.name}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(p)} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <PromoForm promo={editing === "new" ? null : editing} products={products} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PromoForm({ promo, products, categories, onClose, onSaved }: { promo: Promo | null; products: Product[]; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
  const [f, setF] = useState({
    name: promo?.name ?? "",
    kind: (promo?.kind ?? "percent") as PromoLike["kind"],
    value: promo?.value ? String(promo.value) : "",
    billMode: (promo?.billMode ?? "percent") as "percent" | "amount",
    buyQty: promo?.buyQty ? String(promo.buyQty) : "2",
    freeQty: promo?.freeQty ? String(promo.freeQty) : "1",
    minAmount: promo?.minAmount ? String(promo.minAmount) : "",
    maxDiscount: promo?.maxDiscount ? String(promo.maxDiscount) : "",
    appliesTo: (promo?.appliesTo ?? "all") as "all" | "products" | "categories",
    products: (promo?.products ?? []).map(String),
    categories: (promo?.categories ?? []).map(String),
    startsAt: promo?.startsAt ? String(promo.startsAt).slice(0, 10) : "",
    endsAt: promo?.endsAt ? String(promo.endsAt).slice(0, 10) : "",
    active: promo?.active ?? true,
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleIn = (k: "products" | "categories", id: string) => set(k, f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id]);
  const shown = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 60);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...f, value: Number(f.value) || 0, buyQty: Number(f.buyQty) || undefined, freeQty: Number(f.freeQty) || undefined, minAmount: Number(f.minAmount) || 0, maxDiscount: Number(f.maxDiscount) || 0 };
      if (promo) await api(`/api/promotions/${promo._id}`, { method: "PUT", body });
      else await api("/api/promotions", { body });
      toast.success(t("Offer saved"));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={promo ? "Edit offer" : "New offer"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="promo-form" loading={saving}>Save offer</Button>
        </>
      }
    >
      <form id="promo-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2">
          <Input autoFocus required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={t("e.g. Ramzan offer, Biscuits 10% off")} aria-label="Offer name" />
        </Field>
        <div className="sm:col-span-2">
          <Segmented value={f.kind} onChange={(v) => set("kind", v)} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        </div>
        {f.kind === "percent" && (
          <Field label="Percent off">
            <Input type="number" inputMode="decimal" min="1" max="100" step="any" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="10" aria-label="Percent off" />
          </Field>
        )}
        {f.kind === "amount" && (
          <Field label="Rupees off each item">
            <Input type="number" inputMode="decimal" min="1" step="any" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="20" aria-label="Rupees off" />
          </Field>
        )}
        {f.kind === "bxgy" && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="Customer buys">
              <Input type="number" inputMode="numeric" min="1" value={f.buyQty} onChange={(e) => set("buyQty", e.target.value)} aria-label="Buy quantity" />
            </Field>
            <Field label="Gets free">
              <Input type="number" inputMode="numeric" min="1" value={f.freeQty} onChange={(e) => set("freeQty", e.target.value)} aria-label="Free quantity" />
            </Field>
            <p className="col-span-2 text-xs text-slate-500">
              {t("Example: buy {buy} get {free} free — for every {every} of the same item on a bill, {free} are free.", {
                buy: f.buyQty || "X",
                free: f.freeQty || "Y",
                every: (Number(f.buyQty) || 0) + (Number(f.freeQty) || 0) || "X+Y",
              })}
            </p>
          </div>
        )}
        {f.kind === "bill" && (
          <>
            <Field label="Discount">
              <div className="flex gap-2">
                <Input type="number" inputMode="decimal" min="1" step="any" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="5" aria-label="Bill discount" />
                <Select value={f.billMode} onChange={(e) => set("billMode", e.target.value as "percent" | "amount")} className="w-28" aria-label="Bill discount type">
                  <option value="percent">%</option>
                  <option value="amount">Rs</option>
                </Select>
              </div>
            </Field>
            <Field label="When the bill is at least (Rs)">
              <Input type="number" inputMode="decimal" min="0" step="any" value={f.minAmount} onChange={(e) => set("minAmount", e.target.value)} placeholder="2000" aria-label="Minimum bill" />
            </Field>
            {f.billMode === "percent" && (
              <Field label="Up to (Rs, optional)" hint="Largest discount on one bill">
                <Input type="number" inputMode="decimal" min="0" step="any" value={f.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} aria-label="Maximum discount" />
              </Field>
            )}
          </>
        )}
        {f.kind !== "bill" && (
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-sm font-medium text-slate-700">{t("On which items")}</div>
            <Segmented
              value={f.appliesTo}
              onChange={(v) => set("appliesTo", v)}
              options={[
                { value: "all", label: "All items" },
                { value: "products", label: `Chosen items${f.products.length ? ` (${f.products.length})` : ""}` },
                { value: "categories", label: `Categories${f.categories.length ? ` (${f.categories.length})` : ""}` },
              ]}
            />
            {f.appliesTo === "products" && (
              <div className="mt-2 rounded-xl border border-slate-200 p-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search items")} className="h-9" />
                <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                  {shown.map((p) => (
                    <button type="button" key={p._id} onClick={() => toggleIn("products", p._id)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", f.products.includes(p._id) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600")}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {f.appliesTo === "categories" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button type="button" key={c._id} onClick={() => toggleIn("categories", c._id)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", f.categories.includes(c._id) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600")}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Field label="Starts (optional)">
          <Input type="date" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} aria-label="Start date" />
        </Field>
        <Field label="Ends (optional)" hint="Runs until the end of this day">
          <Input type="date" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} aria-label="End date" />
        </Field>
        <label className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="h-5 w-5 accent-brand-600" />
          <span className="font-medium">{t("Offer is on")}</span>
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">{t("An item gets only its best offer; a bill offer is added on top. Wholesale customers and prices typed by hand don't get offers.")}</p>
      </form>
    </Modal>
  );
}
