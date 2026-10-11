"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, Search, Send, Smartphone, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useSession } from "@/components/session";
import { DevicePicker, type DeviceRow } from "@/components/devices";
import { useToast } from "@/components/toast";
import { CameraButton, CameraScanner, beep, useBarcodeScanner } from "@/components/barcode-scanner";
import { api, formatDate, todayISO, UNIT_LABELS } from "@/lib/client";
import { formatQty } from "@/lib/money";

type Product = { _id: string; name: string; barcode?: string; unit: string; stock: number; trackSerial?: boolean };
type Transfer = {
  _id: string;
  transferNo: string;
  fromName: string;
  toName: string;
  items: { name: string; unit: string; qty: number }[];
  note?: string;
  userName?: string;
  createdAt: string;
};

export default function TransfersPage() {
  const toast = useToast();
  const { branch, branches } = useSession();
  const others = (branches ?? []).filter((b) => b._id !== branch?._id);
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  /** `phones` = the phones chosen by IMEI (products tracked by IMEI). */
  const [lines, setLines] = useState<{ product: Product; qty: string; phones?: DeviceRow[] }[]>([]);
  const [phonesFor, setPhonesFor] = useState<Product | null>(null);
  const [to, setTo] = useState(others[0]?._id ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [history, setHistory] = useState<Transfer[] | null>(null);

  const loadProducts = useCallback(() => {
    api<Product[]>("/api/products?limit=5000").then(setProducts).catch(() => {});
  }, []);
  const loadHistory = useCallback(() => {
    api<Transfer[]>(`/api/transfers?from=${range.from}&to=${range.to}`).then(setHistory).catch((e) => toast.error(e.message));
  }, [range, toast]);
  useEffect(loadProducts, [loadProducts]);
  useEffect(loadHistory, [loadHistory]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.barcode === t).slice(0, 8);
  }, [q, products]);

  function add(p: Product) {
    if (!lines.find((l) => l.product._id === p._id)) setLines([...lines, { product: p, qty: "", ...(p.trackSerial ? { phones: [] } : {}) }]);
    if (p.trackSerial) setPhonesFor(p);
    setQ("");
  }
  /** USB scanner or camera: add the product with this barcode. */
  function addByCode(raw: string) {
    const code = raw.trim();
    const p = products.find((x) => x.barcode === code);
    if (p) {
      beep();
      add(p);
    } else toast.error(`No product has barcode ${code}.`);
  }
  const [cameraOpen, setCameraOpen] = useState(false);
  useBarcodeScanner(addByCode, !cameraOpen && !phonesFor);


  async function send() {
    const noPhones = lines.find((l) => l.product.trackSerial && !l.phones?.length);
    if (noPhones) return toast.error(`Choose which ${noPhones.product.name} phones to send.`);
    const bad = lines.find((l) => !l.product.trackSerial && (!(Number(l.qty) > 0) || Number(l.qty) > l.product.stock));
    if (bad) return toast.error(`Check the quantity of ${bad.product.name} (you have ${formatQty(bad.product.stock)}).`);
    setSaving(true);
    try {
      await api("/api/transfers", { body: { toBranch: to, note, items: lines.map((l) => (l.phones ? { productId: l.product._id, qty: l.phones.length, serials: l.phones.map((d) => d._id) } : { productId: l.product._id, qty: Number(l.qty) })) } });
      toast.success(`Stock sent to ${others.find((b) => b._id === to)?.name}`);
      setLines([]);
      setNote("");
      loadProducts();
      loadHistory();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (others.length === 0) {
    return (
      <div>
        <PageHeader title="Stock Transfer" urdu="منتقلی" />
        <Card><EmptyState icon={<ArrowLeftRight className="h-8 w-8" />} title="You need at least two branches" text="Add a branch in Settings to move stock between branches." /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Stock Transfer" urdu="منتقلی" subtitle={`Send stock from ${branch?.name} to another branch`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or scan barcode" className="pl-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  e.preventDefault();
                  if (products.some((x) => x.barcode === q.trim())) addByCode(q);
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
                      <span className="text-sm text-slate-500">Here: {formatQty(p.stock)} {UNIT_LABELS[p.unit]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <CameraButton onClick={() => setCameraOpen(true)} />
          </div>
          {lines.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">Search above to add items to send.</p>
          ) : (
            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th className="text-right">In {branch?.name}</Th>
                    <Th>Send</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.product._id}>
                      <Td className="font-semibold">{l.product.name}</Td>
                      <Td className="text-right text-slate-500">{formatQty(l.product.stock)} {UNIT_LABELS[l.product.unit]}</Td>
                      <Td>
                        {l.phones ? (
                          <button type="button" onClick={() => setPhonesFor(l.product)} className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">
                            <Smartphone className="h-3.5 w-3.5" /> {l.phones.length ? `${l.phones.length} phone${l.phones.length === 1 ? "" : "s"} — change` : "Choose phones"}
                          </button>
                        ) : (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={l.qty}
                            onChange={(e) => setLines(lines.map((x) => (x === l ? { ...x, qty: e.target.value } : x)))}
                            className="h-9 w-24"
                            aria-label={`Quantity of ${l.product.name} to send`}
                          />
                        )}
                        {l.phones && l.phones.length > 0 && <div className="mt-1 font-mono text-[11px] text-slate-500">{l.phones.map((d) => d.imei).join(", ")}</div>}
                      </Td>
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
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold">
            <span className="truncate">{branch?.name}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="truncate">{others.find((b) => b._id === to)?.name}</span>
          </div>
          <Field label="Send to" className="mt-4">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)" className="mt-4">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sent with Rashid" />
          </Field>
          <Button size="lg" className="mt-5 w-full" disabled={!lines.length || !to} loading={saving} icon={<Send className="h-5 w-5" />} onClick={send}>
            Send stock
          </Button>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-bold text-slate-900">Transfer history</h2>
          <DateRange from={range.from} to={range.to} onChange={setRange} />
        </div>
        {!history ? (
          <Spinner />
        ) : history.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No transfers in this period.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>No.</Th>
                <Th>Date</Th>
                <Th>From → To</Th>
                <Th>Items</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t._id}>
                  <Td className="font-semibold">{t.transferNo}</Td>
                  <Td className="text-slate-500">{formatDate(t.createdAt, true)}</Td>
                  <Td>{t.fromName} → {t.toName}</Td>
                  <Td className="whitespace-normal text-slate-600">{t.items.map((i) => `${i.name} ${formatQty(i.qty)} ${UNIT_LABELS[i.unit] ?? i.unit}`).join(", ")}</Td>
                  <Td className="text-slate-500">{t.userName}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={addByCode} continuous title="Scan items" />
      <DevicePicker
        open={!!phonesFor}
        product={phonesFor}
        multiple
        title={phonesFor ? `Which ${phonesFor.name} to send?` : undefined}
        onClose={() => setPhonesFor(null)}
        onPick={(picked) => {
          setLines((ls) => ls.map((l) => (l.product._id === phonesFor?._id ? { ...l, phones: picked } : l)));
          setPhonesFor(null);
        }}
      />
    </div>
  );
}
