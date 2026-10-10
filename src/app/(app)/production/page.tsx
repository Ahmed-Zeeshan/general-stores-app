"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChefHat, History, Pencil, Plus, Trash2, Wheat } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, StatCard, Table, Td, Th, Textarea } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { useSession } from "@/components/session";
import { api, formatDate, todayISO, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty, round2 } from "@/lib/money";

type Product = { _id: string; name: string; unit: string; costPrice: number; salePrice: number; stock: number };
type Recipe = {
  _id: string;
  name: string;
  output: string;
  outputQty: number;
  notes?: string;
  outputProduct: { _id: string; name: string; unit: string; salePrice: number; stock: number } | null;
  ingredients: { product: string; qty: number; name: string; unit: string; stock: number; costPrice: number }[];
  batchCost: number;
  unitCost: number;
};
type Run = {
  _id: string;
  productionNo: string;
  recipeName: string;
  outputName: string;
  outputUnit: string;
  batches: number;
  outputQty: number;
  totalCost: number;
  unitCost: number;
  userName?: string;
  createdAt: string;
};

export default function ProductionPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"make" | "recipes" | "history">("make");
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);

  const loadRecipes = useCallback(() => {
    api<Recipe[]>("/api/recipes").then(setRecipes).catch((e) => toast.error(e.message));
  }, [toast]);
  const loadProducts = useCallback(() => {
    api<Product[]>("/api/products?limit=5000").then(setProducts).catch(() => {});
  }, []);
  useEffect(() => {
    loadRecipes();
    loadProducts();
  }, [loadRecipes, loadProducts]);

  return (
    <div>
      <PageHeader
        title="Production"
        urdu="تیاری"
        subtitle="For bakeries and anything you make in-house: ingredients go out of stock, finished items come in"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>New recipe</Button>}
      />
      <div className="mb-6">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "make", label: "Make items" },
            { value: "recipes", label: `Recipes${recipes ? ` (${recipes.length})` : ""}` },
            { value: "history", label: "History" },
          ]}
        />
      </div>

      {!recipes ? (
        <Spinner />
      ) : tab === "make" ? (
        recipes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ChefHat className="h-8 w-8" />}
              title="Add your first recipe"
              text="A recipe says what one batch needs (e.g. 10 kg flour, 1 kg sugar, 0.2 kg yeast) and how many items it makes (e.g. 40 breads)."
              action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>New recipe</Button>}
            />
          </Card>
        ) : (
          <MakeItems
            recipes={recipes}
            onDone={() => {
              loadRecipes();
              loadProducts();
            }}
          />
        )
      ) : tab === "recipes" ? (
        <RecipeList recipes={recipes} onEdit={setEditing} onChanged={loadRecipes} />
      ) : (
        <ProductionHistory />
      )}

      <RecipeEditor
        value={editing}
        products={products}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          loadRecipes();
        }}
      />
    </div>
  );
}

function MakeItems({ recipes, onDone }: { recipes: Recipe[]; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useSession();
  // Sale price without the sales tax part, so profit is not overstated.
  const netPrice = (price: number) =>
    settings?.taxEnabled && settings.pricesIncludeTax && settings.taxRate ? price / (1 + settings.taxRate / 100) : price;
  const [recipeId, setRecipeId] = useState(recipes[0]?._id ?? "");
  const [batches, setBatches] = useState("1");
  const [note, setNote] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const [saving, setSaving] = useState(false);
  const recipe = recipes.find((r) => r._id === recipeId) ?? recipes[0];
  const n = Number(batches) || 0;

  const lines = useMemo(
    () => (recipe ? recipe.ingredients.map((i) => ({ ...i, need: round2(i.qty * n), cost: round2(i.qty * n * i.costPrice) })) : []),
    [recipe, n],
  );
  const short = lines.filter((l) => l.stock < l.need);
  const outputQty = recipe ? round2(recipe.outputQty * n) : 0;
  const totalCost = round2(lines.reduce((s, l) => s + l.cost, 0));
  const unitCost = outputQty ? round2(totalCost / outputQty) : 0;

  async function save(allowShortage = false) {
    if (!recipe || n <= 0) return;
    if (short.length && !allowShortage) {
      const ok = await confirm({
        title: "Not enough ingredients in stock",
        message: "Continue only if the stock count in the app is wrong (the ingredients are really there).",
        tone: "warning",
        details: short.map((x) => ({ label: x.name, value: `need ${formatQty(x.need)}, have ${formatQty(x.stock)} ${UNIT_LABELS[x.unit] ?? x.unit}` })),
        points: ["Their stock will go below zero until you record a purchase or correct the count."],
        confirmLabel: "Make anyway",
        cancelLabel: "Go back",
      });
      if (!ok) return;
      return save(true);
    }
    setSaving(true);
    try {
      await api("/api/production", { body: { recipeId: recipe._id, batches: n, note, updateCost, allowShortage } });
      toast.success(`${formatQty(outputQty)} ${UNIT_LABELS[recipe.outputProduct?.unit ?? "pcs"]} of ${recipe.outputProduct?.name} added to stock`);
      setBatches("1");
      setNote("");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!recipe) return null;
  const outUnit = UNIT_LABELS[recipe.outputProduct?.unit ?? "pcs"];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What are you making?">
            <Select value={recipe._id} onChange={(e) => setRecipeId(e.target.value)}>
              {recipes.map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="How many batches?" hint={`1 batch = ${formatQty(recipe.outputQty)} ${outUnit}`}>
            <Input type="number" inputMode="decimal" min="0" step="any" value={batches} onChange={(e) => setBatches(e.target.value)} className="text-lg font-bold" />
          </Field>
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Ingredients needed</h3>
        <Table>
          <thead>
            <tr>
              <Th>Ingredient</Th>
              <Th className="text-right">Needed</Th>
              <Th className="text-right">In stock</Th>
              <Th className="text-right">Cost</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={String(l.product)}>
                <Td className="font-medium">{l.name}</Td>
                <Td className="text-right">{formatQty(l.need)} {UNIT_LABELS[l.unit] ?? l.unit}</Td>
                <Td className="text-right">
                  {l.stock < l.need ? <Badge color="red">{formatQty(l.stock)} — short</Badge> : <span className="text-slate-500">{formatQty(l.stock)}</span>}
                </Td>
                <Td className="text-right">{formatPKR(l.cost)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {short.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Not enough stock of {short.map((s) => s.name).join(", ")}. Record a purchase first, or continue anyway if the stock count is wrong.
          </div>
        )}
      </Card>

      <Card className="h-fit p-6">
        <div className="rounded-2xl bg-brand-50 p-5 text-center">
          <div className="text-sm text-brand-800">You will make</div>
          <div className="text-4xl font-extrabold text-brand-900">{formatQty(outputQty)}</div>
          <div className="font-semibold text-brand-800">{outUnit} of {recipe.outputProduct?.name}</div>
        </div>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Ingredients cost</dt><dd className="font-semibold">{formatPKR(totalCost)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Cost per {outUnit}</dt><dd className="font-semibold">{formatPKR(unitCost)}</dd></div>
          {recipe.outputProduct && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Profit per {outUnit}</dt>
              <dd className={`font-semibold ${netPrice(recipe.outputProduct.salePrice) - unitCost < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                {formatPKR(netPrice(recipe.outputProduct.salePrice) - unitCost)}
              </dd>
            </div>
          )}
        </dl>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
          Update {recipe.outputProduct?.name}&apos;s cost price to {formatPKR(unitCost)}
        </label>
        <Field label="Note (optional)" className="mt-4">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Morning batch" />
        </Field>
        <Button size="lg" className="mt-5 w-full" loading={saving} disabled={n <= 0} icon={<ChefHat className="h-5 w-5" />} onClick={() => save()}>
          Save production
        </Button>
      </Card>
    </div>
  );
}

function RecipeList({ recipes, onEdit, onChanged }: { recipes: Recipe[]; onEdit: (r: Recipe) => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  async function remove(r: Recipe) {
    const ok = await confirm({
      title: `Delete recipe "${r.name}"?`,
      message: "Past production records stay in History.",
      tone: "danger",
      icon: "delete",
      confirmLabel: "Delete recipe",
    });
    if (!ok) return;
    try {
      await api(`/api/recipes/${r._id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  if (!recipes.length) return <Card><EmptyState icon={<Wheat className="h-8 w-8" />} title="No recipes yet" /></Card>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {recipes.map((r) => (
        <Card key={r._id} className="flex flex-col p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900">{r.name}</h3>
              <p className="text-sm text-slate-500">
                Makes {formatQty(r.outputQty)} {UNIT_LABELS[r.outputProduct?.unit ?? "pcs"]} of {r.outputProduct?.name ?? "(deleted item)"}
              </p>
            </div>
            <div className="flex">
              <button onClick={() => onEdit(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <ul className="mt-3 flex-1 space-y-1 text-sm">
            {r.ingredients.map((i) => (
              <li key={String(i.product)} className="flex justify-between text-slate-600">
                <span>{i.name}</span>
                <span>{formatQty(i.qty)} {UNIT_LABELS[i.unit] ?? i.unit}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-dashed border-slate-200 pt-3 text-sm">
            <span className="text-slate-500">Cost per {UNIT_LABELS[r.outputProduct?.unit ?? "pcs"]}</span>
            <b>{formatPKR(r.unitCost)}</b>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProductionHistory() {
  const toast = useToast();
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => {
    setRuns(null);
    api<Run[]>(`/api/production?from=${range.from}&to=${range.to}`).then(setRuns).catch((e) => toast.error(e.message));
  }, [range, toast]);
  const cost = runs?.reduce((s, r) => s + r.totalCost, 0) ?? 0;
  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Production runs" value={runs?.length ?? "—"} icon={<History className="h-5 w-5" />} />
        <StatCard label="Ingredients used (cost)" value={formatPKR(cost)} icon={<Wheat className="h-5 w-5" />} tone="amber" />
      </div>
      <Card>
        <div className="border-b border-slate-100 p-4"><DateRange from={range.from} to={range.to} onChange={setRange} /></div>
        {!runs ? (
          <Spinner />
        ) : runs.length === 0 ? (
          <EmptyState icon={<History className="h-8 w-8" />} title="No production in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>No.</Th>
                <Th>Date</Th>
                <Th>Recipe</Th>
                <Th className="text-right">Made</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Per unit</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r._id}>
                  <Td className="font-semibold">{r.productionNo}</Td>
                  <Td className="text-slate-500">{formatDate(r.createdAt, true)}</Td>
                  <Td>
                    {r.recipeName}
                    <div className="text-xs text-slate-400">{formatQty(r.batches)} batch(es){r.userName && ` · ${r.userName}`}</div>
                  </Td>
                  <Td className="text-right">{formatQty(r.outputQty)} {UNIT_LABELS[r.outputUnit] ?? r.outputUnit}</Td>
                  <Td className="text-right font-semibold">{formatPKR(r.totalCost)}</Td>
                  <Td className="text-right">{formatPKR(r.unitCost)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function RecipeEditor({ value, products, onClose, onSaved }: { value: Recipe | "new" | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", output: "", outputQty: "", notes: "" });
  const [lines, setLines] = useState<{ product: string; qty: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!value) return;
    if (value === "new") {
      setForm({ name: "", output: "", outputQty: "", notes: "" });
      setLines([{ product: "", qty: "" }]);
    } else {
      setForm({ name: value.name, output: String(value.output), outputQty: String(value.outputQty), notes: value.notes ?? "" });
      setLines(value.ingredients.map((i) => ({ product: String(i.product), qty: String(i.qty) })));
    }
  }, [value]);
  if (!value) return null;

  const byId = new Map(products.map((p) => [p._id, p]));
  const batchCost = round2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (byId.get(l.product)?.costPrice ?? 0), 0));
  const perUnit = Number(form.outputQty) ? round2(batchCost / Number(form.outputQty)) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ingredients = lines.filter((l) => l.product).map((l) => ({ product: l.product, qty: Number(l.qty) }));
    setSaving(true);
    try {
      const body = { ...form, outputQty: Number(form.outputQty), ingredients };
      if (value === "new") await api("/api/recipes", { body });
      else await api(`/api/recipes/${(value as Recipe)._id}`, { method: "PUT", body });
      toast.success("Recipe saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const outUnit = UNIT_LABELS[byId.get(form.output)?.unit ?? "pcs"];

  return (
    <Modal
      open
      onClose={onClose}
      title={value === "new" ? "New recipe" : "Edit recipe"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="recipe-form" loading={saving}>Save recipe</Button>
        </>
      }
    >
      <form id="recipe-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Recipe name *" className="sm:col-span-3">
            <Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bread Large (40 pcs batch)" />
          </Field>
          <Field label="Makes which item? *" className="sm:col-span-2" hint="Add the finished item in Products first if it is not listed">
            <Select required value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value })}>
              <option value="">Choose item…</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={`One batch makes (${outUnit}) *`}>
            <Input required type="number" inputMode="decimal" min="0" step="any" value={form.outputQty} onChange={(e) => setForm({ ...form, outputQty: e.target.value })} />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Ingredients for one batch *</div>
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="flex gap-2">
                <Select
                  value={l.product}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, product: e.target.value } : x)))}
                  className="min-w-0 flex-1"
                >
                  <option value="">Choose ingredient…</option>
                  {products.filter((p) => p._id !== form.output).map((p) => (
                    <option key={p._id} value={p._id}>{p.name} ({UNIT_LABELS[p.unit]})</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="Qty"
                  value={l.qty}
                  required={!!l.product}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                  className="w-28 shrink-0"
                />
                <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setLines([...lines, { product: "", qty: "" }])}>
            Add ingredient
          </Button>
        </div>

        <div className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm">
          <span>Batch cost <b>{formatPKR(batchCost)}</b></span>
          <span>Per {outUnit} <b>{formatPKR(perUnit)}</b></span>
        </div>
        <Field label="Notes (optional)">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[60px]" placeholder="Method, oven temperature, etc." />
        </Field>
      </form>
    </Modal>
  );
}
