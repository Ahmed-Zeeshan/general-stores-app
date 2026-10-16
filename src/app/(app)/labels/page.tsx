"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Printer, Search, Trash2, Wand2 } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { BarcodeSvg } from "@/components/barcode";
import { CameraButton, CameraScanner, beep, useBarcodeScanner } from "@/components/barcode-scanner";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, UNIT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { productMatches } from "@/lib/product-search";
import { useT } from "@/lib/i18n";

type Product = { _id: string; name: string; nameUrdu?: string; barcode?: string; unit: string; salePrice: number; stock: number };
type Line = { product: Product; copies: number };

/** Label sizes: thermal label rolls (one label per printed page) and A4 sticker sheets. */
const TEMPLATES = {
  "roll-38x25": { name: "Label roll 38 × 25 mm", kind: "roll", w: 38, h: 25, cols: 1, perPage: 1 },
  "roll-50x30": { name: "Label roll 50 × 30 mm", kind: "roll", w: 50, h: 30, cols: 1, perPage: 1 },
  "a4-24": { name: "A4 sheet, 24 labels (70 × 37 mm)", kind: "sheet", w: 70, h: 37.125, cols: 3, perPage: 24 },
  "a4-40": { name: "A4 sheet, 40 labels (52.5 × 29.7 mm)", kind: "sheet", w: 52.5, h: 29.7, cols: 4, perPage: 40 },
} as const;
type TemplateKey = keyof typeof TEMPLATES;
const MAX_LABELS = 3000;

export default function LabelsPageWrapper() {
  return (
    <Suspense fallback={<Spinner />}>
      <LabelsPage />
    </Suspense>
  );
}

function LabelsPage() {
  const toast = useToast();
  const tr = useT();
  const params = useSearchParams();
  const { settings } = useSession();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("roll-38x25");
  const [show, setShow] = useState({ shop: true, name: true, price: true, code: true });
  const [skip, setSkip] = useState(0);
  const [creating, setCreating] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const load = useCallback(async () => {
    const list = await api<Product[]>("/api/products?limit=5000");
    setProducts(list);
    return list;
  }, []);

  useEffect(() => {
    load()
      .then((list) => {
        const ids = params.get("ids")?.split(",").filter(Boolean) ?? [];
        if (ids.length) setLines(list.filter((p) => ids.includes(p._id)).map((p) => ({ product: p, copies: 1 })));
      })
      .catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !products) return [];
    return products.filter((p) => productMatches(p, q)).slice(0, 8);
  }, [q, products]);

  function add(p: Product, copies = 1) {
    setLines((ls) => (ls.some((l) => l.product._id === p._id) ? ls.map((l) => (l.product._id === p._id ? { ...l, copies: l.copies + copies } : l)) : [...ls, { product: p, copies }]));
    setQ("");
  }
  function addByCode(code: string) {
    const p = products?.find((x) => x.barcode === code.trim());
    if (p) {
      beep();
      add(p);
    } else toast.error(tr("No product has barcode {code}.", { code }));
  }
  useBarcodeScanner(addByCode, !cameraOpen);

  const missing = lines.filter((l) => !l.product.barcode);
  async function createMissing() {
    setCreating(true);
    try {
      await api("/api/barcodes/assign", { body: { productIds: missing.map((l) => l.product._id) } });
      const list = await load();
      setLines((ls) => ls.map((l) => ({ ...l, product: list.find((p) => p._id === l.product._id) ?? l.product })));
      toast.success(tr("Barcodes created"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const t = TEMPLATES[template];
  const labels = useMemo(() => {
    const out: (Product | null)[] = t.kind === "sheet" ? Array.from({ length: skip }, () => null) : [];
    for (const l of lines) if (l.product.barcode) for (let i = 0; i < l.copies; i++) out.push(l.product);
    return out;
  }, [lines, skip, t.kind]);
  const pages = t.kind === "sheet" ? Math.ceil(labels.length / t.perPage) : labels.length;
  const totalLabels = labels.filter(Boolean).length;

  const pageCss =
    t.kind === "roll"
      ? `@page { size: ${t.w}mm ${t.h}mm; margin: 0; } .label { page-break-after: always; break-after: page; }`
      : `@page { size: A4; margin: 0; } .sheet { display: grid; grid-template-columns: repeat(${t.cols}, ${t.w}mm); grid-auto-rows: ${t.h}mm; }`;

  // Bigger labels get bigger text and barcodes.
  const small = t.h < 30;
  const barcodeHeight = small ? 9 : 12;

  return (
    <div>
      <style>{`@media print { ${pageCss} body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; } }`}</style>
      <div className="no-print">
        <PageHeader
          title="Barcode Labels"
          urdu="بارکوڈ لیبل"
          subtitle="Print stickers with barcode and price for your items"
          actions={
            <Button icon={<Printer className="h-4 w-4" />} disabled={!totalLabels} onClick={() => window.print()}>
              {tr(totalLabels === 1 ? "Print {n} label" : "Print {n} labels", { n: Math.min(totalLabels, MAX_LABELS) })}
            </Button>
          }
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search product or scan barcode to add")} className="pl-10" />
                {matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    {matches.map((p) => (
                      <li key={p._id}>
                        <button onClick={() => add(p)} className="flex w-full justify-between px-4 py-2.5 text-left hover:bg-slate-50">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-sm text-slate-500">{p.barcode || tr("no barcode")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <CameraButton onClick={() => setCameraOpen(true)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!products} onClick={() => setLines((products ?? []).map((p) => ({ product: p, copies: 1 })))}>
                All products (1 each)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!products}
                onClick={() => setLines((products ?? []).filter((p) => p.stock > 0).map((p) => ({ product: p, copies: Math.max(1, Math.ceil(p.stock)) })))}
              >
                One per item in stock
              </Button>
              {lines.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setLines([])}>
                  Clear
                </Button>
              )}
            </div>

            {missing.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {tr("{n} item(s) have no barcode and will be skipped.", { n: missing.length })}
                </span>
                <Button size="sm" loading={creating} icon={<Wand2 className="h-4 w-4" />} onClick={createMissing}>
                  Create barcodes
                </Button>
              </div>
            )}

            {!products ? (
              <Spinner />
            ) : lines.length === 0 ? (
              <p className="py-14 text-center text-sm text-slate-500">{tr("Add items above, or open this page from a product's barcode button.")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {lines.map((l) => (
                  <li key={l.product._id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-800">{l.product.name}</div>
                      <div className="text-xs text-slate-500">
                        {l.product.barcode || <span className="text-amber-700">{tr("No barcode")}</span>} · {formatPKR(l.product.salePrice)}/{UNIT_LABELS[l.product.unit]}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={l.copies}
                      onChange={(e) => setLines(lines.map((x) => (x === l ? { ...x, copies: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) } : x)))}
                      className="h-9 w-20"
                      aria-label="Copies"
                    />
                    <button onClick={() => setLines(lines.filter((x) => x !== l))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="h-fit space-y-4 p-5">
            <Field label="Label size">
              <Select value={template} onChange={(e) => setTemplate(e.target.value as TemplateKey)}>
                {Object.entries(TEMPLATES).map(([k, v]) => (
                  <option key={k} value={k}>{tr(v.name)}</option>
                ))}
              </Select>
            </Field>
            {t.kind === "sheet" && (
              <Field label="Skip labels already used on the sheet" hint="Use a half-used sticker sheet">
                <Input type="number" min={0} max={t.perPage - 1} value={skip} onChange={(e) => setSkip(Math.max(0, Math.min(t.perPage - 1, Number(e.target.value) || 0)))} />
              </Field>
            )}
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">{tr("Show on label")}</div>
              {(
                [
                  ["shop", "Shop name"],
                  ["name", "Product name"],
                  ["price", "Price"],
                  ["code", "Barcode number"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                  {tr(label)}
                </label>
              ))}
            </div>
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              {t.kind === "roll"
                ? tr("For label printers (e.g. Xprinter, Zebra, TSC): set the paper size in the printer settings to the same size, margins none, scale 100%.")
                : tr("For A4 sticker sheets: in the print window set margins to None and scale to 100% (Actual size).")}{" "}
              {tr(t.kind === "sheet" ? "{n} label(s) on {pages} sheet(s)." : "{n} label(s).", { n: totalLabels, pages })}
            </p>
          </Card>
        </div>
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">{tr("Preview")}</h2>
      </div>

      <div className="print-area">
        <div className={t.kind === "sheet" ? "sheet gap-0 bg-white" : "flex flex-wrap gap-3 print:block"} style={t.kind === "sheet" ? { display: "grid", gridTemplateColumns: `repeat(${t.cols}, ${t.w}mm)`, gridAutoRows: `${t.h}mm`, width: `${t.cols * t.w}mm` } : undefined}>
          {labels.slice(0, MAX_LABELS).map((p, i) =>
            p ? (
              <div
                key={i}
                className="label flex flex-col items-center justify-center overflow-hidden bg-white text-center text-black ring-1 ring-slate-200 print:ring-0"
                style={{ width: `${t.w}mm`, height: `${t.h}mm`, padding: "1.2mm 1.5mm", boxSizing: "border-box" }}
              >
                {show.shop && <div className="w-full truncate font-semibold uppercase" style={{ fontSize: small ? "6pt" : "7pt", lineHeight: 1.1 }}>{settings?.shopName}</div>}
                {show.name && <div className="w-full truncate font-bold" style={{ fontSize: small ? "7.5pt" : "9pt", lineHeight: 1.15 }}>{p.name}</div>}
                <BarcodeSvg value={p.barcode!} displayValue={show.code} height={40} width={2} fontSize={14} style={{ width: "100%", height: `${barcodeHeight + (show.code ? 3 : 0)}mm` }} />
                {show.price && <div className="font-extrabold" style={{ fontSize: small ? "9pt" : "11pt", lineHeight: 1.1 }}>{formatPKR(p.salePrice)}</div>}
              </div>
            ) : (
              <div key={i} style={{ width: `${t.w}mm`, height: `${t.h}mm` }} />
            ),
          )}
        </div>
        {labels.length > MAX_LABELS && (
          <p className="no-print mt-3 text-sm font-semibold text-amber-700">
            {tr("Only the first {n} labels are printed at a time. Print these, then reduce the list and print the rest.", { n: MAX_LABELS })}
          </p>
        )}
      </div>
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={addByCode} continuous title={tr("Scan items")} />
    </div>
  );
}
