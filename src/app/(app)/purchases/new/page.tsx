"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus, Search, Trash2, Truck, X } from "lucide-react";
import Link from "next/link";
import { Button, Card, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { CustomerPicker, type PartyLite } from "@/components/customer-picker";
import { useToast } from "@/components/toast";
import { CameraButton, CameraScanner, beep, useBarcodeScanner } from "@/components/barcode-scanner";
import { api, UNIT_LABELS } from "@/lib/client";
import { formatPKR, round2 } from "@/lib/money";

type Pack = { name: string; size: number; barcode?: string };
type Product = { _id: string; name: string; barcode?: string; unit: string; costPrice: number; salePrice: number; stock: number; packs?: Pack[] };
/** `pack` = "" for loose units; then qty and cost are per pack. */
type Line = { product: Product; qty: string; cost: string; salePrice: string; pack: string };

export default function NewPurchasePage() {
  const router = useRouter();
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [supplier, setSupplier] = useState<PartyLite | null>(null);
  const [pick, setPick] = useState(false);
  const [paid, setPaid] = useState("");
  const [invoice, setInvoice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Product[]>("/api/products?limit=2000").then(setProducts).catch(() => {});
  }, []);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.barcode === t).slice(0, 8);
  }, [q, products]);

  const packCost = (p: Product, pack?: Pack) => (pack ? round2(p.costPrice * pack.size) : p.costPrice);
  function add(p: Product, pack?: Pack) {
    if (!lines.find((l) => l.product._id === p._id)) {
      setLines([...lines, { product: p, qty: "", cost: String(packCost(p, pack) || ""), salePrice: String(p.salePrice || ""), pack: pack?.name ?? "" }]);
    }
    setQ("");
  }
  function changePack(l: Line, name: string) {
    const pack = l.product.packs?.find((k) => k.name === name);
    update(l.product._id, { pack: name, cost: String(packCost(l.product, pack) || "") });
  }
  /** USB scanner or camera: add the product with this barcode. */
  function addByCode(raw: string) {
    const code = raw.trim();
    const p = products.find((x) => x.barcode === code);
    const byPack = p ? null : products.find((x) => x.packs?.some((k) => k.barcode === code));
    if (p) {
      beep();
      add(p);
    } else if (byPack) {
      beep();
      add(byPack, byPack.packs!.find((k) => k.barcode === code));
    } else toast.error(`No product has barcode ${code}.`);
  }
  const [cameraOpen, setCameraOpen] = useState(false);
  useBarcodeScanner(addByCode, !cameraOpen);

  const update = (id: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.product._id === id ? { ...l, ...patch } : l)));
  const total = round2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0));

  async function save() {
    if (lines.some((l) => !(Number(l.qty) > 0))) return toast.error("Enter quantity for every item.");
    setSaving(true);
    try {
      await api("/api/purchases", {
        body: {
          supplierId: supplier?._id,
          supplierInvoice: invoice,
          amountPaid: paid === "" ? undefined : Number(paid),
          items: lines.map((l) => ({ productId: l.product._id, qty: Number(l.qty), cost: Number(l.cost) || 0, salePrice: Number(l.salePrice) || undefined, ...(l.pack ? { pack: l.pack } : {}) })),
        },
      });
      toast.success("Purchase saved and stock updated");
      router.push("/purchases");
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div>
      <Link href="/purchases" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to purchases
      </Link>
      <PageHeader title="New Purchase" urdu="مال آمد" subtitle="Add stock that arrived from a supplier. Stock and prices update automatically." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or scan barcode to add" className="pl-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  e.preventDefault();
                  if (products.some((x) => x.barcode === q.trim() || x.packs?.some((k) => k.barcode === q.trim()))) addByCode(q);
                  else if (matches.length === 1) add(matches[0]);
                }
              }}
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {matches.map((p) => (
                  <li key={p._id}>
                    <button onClick={() => add(p)} className="flex w-full justify-between px-4 py-2.5 text-left hover:bg-slate-50">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-sm text-slate-500">Stock {p.stock} {UNIT_LABELS[p.unit]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <CameraButton onClick={() => setCameraOpen(true)} />
          </div>

          {lines.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">Search above to add items to this purchase.</p>
          ) : (
            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Qty</Th>
                    <Th>Cost (each)</Th>
                    <Th>Sale price / unit</Th>
                    <Th className="text-right">Total</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.product._id}>
                      <Td>
                        <div className="font-semibold">{l.product.name}</div>
                        {(l.product.packs?.length ?? 0) > 0 ? (
                          <select
                            value={l.pack}
                            onChange={(e) => changePack(l, e.target.value)}
                            aria-label={`Bought as (${l.product.name})`}
                            className="mt-1 h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-700"
                          >
                            <option value="">{UNIT_LABELS[l.product.unit]}</option>
                            {l.product.packs!.map((k) => (
                              <option key={k.name} value={k.name}>
                                {k.name} ({k.size} {UNIT_LABELS[l.product.unit]})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-xs text-slate-400">per {UNIT_LABELS[l.product.unit]}</div>
                        )}
                        {l.pack && Number(l.qty) > 0 && (
                          <div className="text-xs text-slate-400">
                            = {round2(Number(l.qty) * (l.product.packs?.find((k) => k.name === l.pack)?.size ?? 1))} {UNIT_LABELS[l.product.unit]} in stock
                          </div>
                        )}
                      </Td>
                      <Td><Input type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => update(l.product._id, { qty: e.target.value })} className="h-9 w-20" /></Td>
                      <Td><Input type="number" inputMode="decimal" min="0" step="any" value={l.cost} onChange={(e) => update(l.product._id, { cost: e.target.value })} className="h-9 w-24" /></Td>
                      <Td><Input type="number" inputMode="decimal" min="0" step="any" value={l.salePrice} onChange={(e) => update(l.product._id, { salePrice: e.target.value })} className="h-9 w-24" /></Td>
                      <Td className="text-right font-semibold">{formatPKR((Number(l.qty) || 0) * (Number(l.cost) || 0))}</Td>
                      <Td>
                        <button onClick={() => setLines(lines.filter((x) => x !== l))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <Card className="h-fit p-5">
          <h2 className="mb-4 font-bold text-slate-900">Supplier & payment</h2>
          <button onClick={() => setPick(true)} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-left hover:border-brand-400">
            <Truck className="h-5 w-5 text-slate-400" />
            <span className="flex-1 font-medium text-slate-700">{supplier?.name ?? "Choose supplier (optional)"}</span>
            {supplier && (
              <span role="button" onClick={(e) => { e.stopPropagation(); setSupplier(null); }} className="text-slate-400">
                <X className="h-4 w-4" />
              </span>
            )}
          </button>
          <div className="mt-4 space-y-4">
            <Field label="Supplier's bill number">
              <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            </Field>
            {supplier && (
              <Field label="Amount paid now" hint="Leave empty if paid in full. The rest goes to the supplier's khata.">
                <Input type="number" inputMode="decimal" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={String(total)} />
              </Field>
            )}
          </div>
          <div className="mt-5 flex items-end justify-between border-t border-dashed border-slate-200 pt-4">
            <span className="font-semibold text-slate-600">Total</span>
            <span className="text-2xl font-extrabold">{formatPKR(total)}</span>
          </div>
          <Button size="lg" className="mt-4 w-full" disabled={!lines.length} loading={saving} onClick={save} icon={<PackagePlus className="h-5 w-5" />}>
            Save purchase
          </Button>
        </Card>
      </div>

      <CustomerPicker type="supplier" open={pick} onClose={() => setPick(false)} onPick={(p) => { setSupplier(p); setPick(false); }} />
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={addByCode} continuous title="Scan items" />
    </div>
  );
}
