"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, History, PackageSearch, Pencil, Plus, Repeat, ScanBarcode, Search, ShieldCheck, Smartphone, Trash2, Wallet } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, StatCard, Table, Td, Textarea, Th } from "@/components/ui";
import { CheckDigit, DeviceTags, Imei, ImeiInput, type DeviceRow } from "@/components/devices";
import { CameraButton, CameraScanner, useBarcodeScanner } from "@/components/barcode-scanner";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { CONDITION_LABELS, PTA_LABELS, cleanImei, type ImeiLine } from "@/lib/imei";
import { DEVICE_CONDITIONS, PTA_STATUS } from "@/lib/constants";

type Model = { _id: string; name: string; costPrice: number; salePrice: number; trackSerial?: boolean; warrantyMonths?: number; stock: number };
type Status = "in_stock" | "sold" | "returned" | "removed" | "all";

const STATUS_BADGE: Record<DeviceRow["status"], { label: string; color: "green" | "blue" | "amber" | "red" }> = {
  in_stock: { label: "In stock", color: "green" },
  sold: { label: "Sold", color: "blue" },
  returned: { label: "Returned to supplier", color: "amber" },
  removed: { label: "Removed", color: "red" },
};

export default function PhonesPageWrapper() {
  return (
    <Suspense fallback={<Spinner />}>
      <PhonesPage />
    </Suspense>
  );
}

function PhonesPage() {
  const toast = useToast();
  const can = useCan();
  const { branches } = useSession();
  const params = useSearchParams();
  // Opened from search with ?q=IMEI: look in every status.
  const [status, setStatus] = useState<Status>(params.get("q") ? "all" : "in_stock");
  const [model, setModel] = useState(params.get("product") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [allBranches, setAllBranches] = useState(false);
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<DeviceRow | null>(null);
  const multiBranch = (branches?.length ?? 0) > 1;

  const load = useCallback(() => {
    const p = new URLSearchParams({ status });
    if (model) p.set("product", model);
    if (q.trim()) p.set("q", q.trim());
    if (allBranches) p.set("branch", "all");
    api<DeviceRow[]>(`/api/devices?${p}`)
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, [status, model, q, allBranches, toast]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  const loadModels = useCallback(() => {
    api<Model[]>("/api/products?limit=5000")
      .then((list) => setModels(list.filter((p) => p.trackSerial)))
      .catch(() => {});
  }, []);
  useEffect(loadModels, [loadModels]);

  const inStock = useMemo(() => (status === "in_stock" ? rows ?? [] : []), [rows, status]);
  const branchName = (id: string) => branches?.find((b) => b._id === id)?.name ?? "";

  return (
    <div>
      <PageHeader
        title="Phones (IMEI)"
        urdu="موبائل فون"
        subtitle="Every phone by its IMEI: what is in stock, who bought it, warranty and its full history"
        actions={
          can.manage && (
            <>
              <Link href="/products">
                <Button variant="outline" icon={<Boxes className="h-4 w-4" />}>Phone models</Button>
              </Link>
              <Link href="/used-phones/new">
                <Button variant="outline" icon={<Repeat className="h-4 w-4" />}>Buy used phone</Button>
              </Link>
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                Add phones
              </Button>
            </>
          )
        }
      />

      <ImeiCheck onOpen={setViewing} />

      {status === "in_stock" && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Phones in stock" value={inStock.length} icon={<Smartphone className="h-5 w-5" />} hint={(() => {
              const n = new Set(inStock.map((d) => d.product)).size;
              return `${n} model${n === 1 ? "" : "s"}`;
            })()} />
          {can.manage && <StatCard label="Stock value (cost)" value={formatPKR(inStock.reduce((a, d) => a + (d.cost ?? 0), 0))} icon={<Wallet className="h-5 w-5" />} tone="violet" />}
          <StatCard
            label="Used / non-PTA"
            value={`${inStock.filter((d) => d.condition !== "new").length} / ${inStock.filter((d) => d.pta === "non_pta").length}`}
            icon={<ShieldCheck className="h-5 w-5" />}
            tone="amber"
            hint="Used or refurbished · non-PTA phones in stock"
          />
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "in_stock", label: "In stock" },
              { value: "sold", label: "Sold" },
              { value: "returned", label: "Returned" },
              { value: "removed", label: "Removed" },
              { value: "all", label: "All" },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model" className="sm:w-56">
              <option value="">All models</option>
              {models.map((m) => (
                <option key={m._id} value={m._id}>{m.name}</option>
              ))}
            </Select>
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="IMEI, colour, customer…" className="pl-9" aria-label="Search phones" />
            </div>
            {multiBranch && can.manage && (
              <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
                <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                All branches
              </label>
            )}
          </div>
        </div>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="h-7 w-7" />}
            title={status === "in_stock" ? "No phones in stock" : "Nothing found"}
            text={
              models.length === 0 && can.manage
                ? 'First add a phone model in Products and tick "Track each piece by IMEI", then add phones here or through a purchase.'
                : status === "in_stock"
                  ? "Add phones with their IMEIs, or receive them through a purchase."
                  : "Try another filter or search."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Phone</Th>
                <Th>IMEI</Th>
                <Th>Status</Th>
                <Th className="text-right">Price</Th>
                {can.manage && <Th className="text-right">Cost</Th>}
                <Th>{status === "sold" ? "Sold" : "Added"}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d._id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-800">{d.productName}</div>
                    <div className="mt-0.5">
                      <DeviceTags d={d} />
                    </div>
                  </Td>
                  <Td>
                    <Imei d={d} />
                  </Td>
                  <Td>
                    <Badge color={STATUS_BADGE[d.status].color}>{STATUS_BADGE[d.status].label}</Badge>
                    {d.status === "sold" && d.sale && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {d.sale.invoiceNo}
                        {d.sale.customerName && ` · ${d.sale.customerName}`}
                      </div>
                    )}
                    {(allBranches || status !== "in_stock") && multiBranch && <div className="text-xs text-slate-400">{branchName(d.branch)}</div>}
                  </Td>
                  <Td className="text-right font-semibold">{d.status === "sold" && d.sale?.price ? formatPKR(d.sale.price) : d.price ? formatPKR(d.price) : <span className="font-normal text-slate-400">Model price</span>}</Td>
                  {can.manage && <Td className="text-right text-slate-500">{formatPKR(d.cost ?? 0)}</Td>}
                  <Td className="text-slate-500">{formatDate(d.status === "sold" ? d.sale?.at : d.createdAt)}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" icon={<History className="h-4 w-4" />} onClick={() => setViewing(d)}>
                      Details
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <AddPhonesModal
        open={adding}
        models={models}
        initialModel={model}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          load();
          loadModels();
        }}
      />
      <DeviceModal
        device={viewing}
        onClose={() => setViewing(null)}
        onChanged={() => {
          load();
          loadModels();
        }}
      />
    </div>
  );
}

/** Big "check an IMEI" box: scan or type, see the phone's whole story. */
function ImeiCheck({ onOpen }: { onOpen: (d: DeviceRow) => void }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ imei: string; checkOk: boolean; records: DeviceRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const toast = useToast();
  async function check(raw?: string) {
    const imei = cleanImei(raw ?? value);
    if (imei.length < 4) return;
    setValue(imei);
    setBusy(true);
    try {
      setResult(await api(`/api/devices/lookup?imei=${encodeURIComponent(imei)}`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useBarcodeScanner((code) => check(code), !camera);
  return (
    <Card className="mb-6 p-4 sm:p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Scan or type an IMEI to check" className="h-12 pl-11 font-mono" aria-label="Check IMEI" />
        </div>
        <div className="flex gap-2">
          <CameraButton onClick={() => setCamera(true)} />
          <Button type="submit" size="lg" loading={busy} className="flex-1 sm:flex-none">
            Check
          </Button>
        </div>
      </form>
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={(c) => check(c)} title="Scan the IMEI barcode" />
      {result && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="font-mono font-semibold text-slate-800">{result.imei}</span>
            <CheckDigit ok={result.checkOk} />
          </div>
          <p className="mb-2 text-xs text-slate-500">Tip: dial *#06# on any phone to see its IMEI.</p>
          {result.records.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This IMEI has never been in your shop.</p>
          ) : (
            <div className="space-y-3">
              {result.records.map((d) => (
                <DeviceStory key={d._id} d={d} onOpen={() => onOpen(d)} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function warrantyBadge(until?: string) {
  if (!until) return null;
  const active = new Date(until) >= new Date();
  return <Badge color={active ? "green" : "slate"}>{active ? `In warranty till ${formatDate(until)}` : `Warranty ended ${formatDate(until)}`}</Badge>;
}

function sourceText(d: DeviceRow) {
  const s = d.source;
  if (!s) return "Added";
  if (s.type === "purchase") return `Bought on ${s.refNo}${s.name ? ` from ${s.name}` : ""}`;
  if (s.type === "used_buy") return `Bought used${s.name ? ` from ${s.name}` : ""}${s.refNo ? ` (${s.refNo})` : ""}`;
  if (s.type === "repossess") return `Taken back${s.refNo ? ` (${s.refNo})` : ""}`;
  return "Added to stock";
}

/** One record of a phone: where it came from, where it went, and its history. */
function DeviceStory({ d, onOpen }: { d: DeviceRow; onOpen?: () => void }) {
  const can = useCan();
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900">{d.productName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge color={STATUS_BADGE[d.status].color}>{STATUS_BADGE[d.status].label}</Badge>
            <DeviceTags d={d} />
          </div>
        </div>
        {onOpen && (
          <Button size="sm" variant="outline" onClick={onOpen}>
            Open
          </Button>
        )}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-slate-500">IMEI</dt>
          <dd><Imei d={d} /></dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-slate-500">Came in</dt>
          <dd>
            {sourceText(d)} · {formatDate(d.createdAt)}
            {can.manage && d.cost ? <span className="text-slate-500"> · cost {formatPKR(d.cost)}</span> : null}
          </dd>
        </div>
        {d.sale && (
          <div className="flex justify-between gap-3 sm:col-span-2 sm:block">
            <dt className="text-slate-500">Sold</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {d.sale.id ? (
                <a href={`/receipt/${d.sale.id}`} target="_blank" className="font-semibold text-brand-700 hover:underline">
                  {d.sale.invoiceNo}
                </a>
              ) : (
                d.sale.invoiceNo
              )}
              {d.sale.customerName && <span>to {d.sale.customerName}</span>}
              <span className="text-slate-500">{formatDate(d.sale.at)}</span>
              {d.sale.price ? <span className="font-semibold">{formatPKR(d.sale.price)}</span> : null}
              {warrantyBadge(d.sale.warrantyUntil)}
            </dd>
          </div>
        )}
      </dl>
      {d.history && d.history.length > 0 && (
        <ol className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-4 text-sm">
          {d.history.map((h, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
              <span className="font-semibold text-slate-800">{h.action}</span>
              {h.refNo && <span className="text-slate-600"> · {h.refNo}</span>}
              {h.note && <span className="text-slate-600"> · {h.note}</span>}
              <span className="block text-xs text-slate-400">
                {formatDate(h.at, true)}
                {h.userName && ` · ${h.userName}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Add phones that are already in the shop (opening stock) with their IMEIs. */
function AddPhonesModal({ open, models, initialModel, onClose, onSaved }: { open: boolean; models: Model[]; initialModel: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [productId, setProductId] = useState("");
  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState<(typeof DEVICE_CONDITIONS)[number]>("new");
  const [pta, setPta] = useState<(typeof PTA_STATUS)[number]>("approved");
  const [color, setColor] = useState("");
  const [storage, setStorage] = useState("");
  const [text, setText] = useState("");
  const [lines, setLines] = useState<ImeiLine[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = initialModel || models[0]?._id || "";
    setProductId(first);
    setCost(String(models.find((m) => m._id === first)?.costPrice ?? ""));
    setText("");
    setLines([]);
    setColor("");
    setStorage("");
    setCondition("new");
    setPta("approved");
  }, [open, initialModel, models]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!lines.length) return toast.error("Scan or type at least one IMEI.");
    if (lines.some((l) => l.blocking)) return toast.error("Fix the IMEIs marked in red first.");
    setSaving(true);
    try {
      const added = await api<DeviceRow[]>("/api/devices", {
        body: { productId, cost: Number(cost) || 0, units: lines.map((l) => ({ imei: l.imei, imei2: l.imei2, color: color || undefined, storage: storage || undefined, condition, pta })) },
      });
      toast.success(`${added.length} phone${added.length === 1 ? "" : "s"} added to stock`);
      onSaved();
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
      title="Add phones with IMEI"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-phones" loading={saving} disabled={!models.length}>
            Add {lines.length || ""} phone{lines.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {models.length === 0 ? (
        <p className="text-sm text-slate-600">
          No phone models yet. Add one in <Link href="/products" className="font-semibold text-brand-700">Products</Link> and tick &quot;Track each piece by IMEI&quot;.
        </p>
      ) : (
        <form id="add-phones" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Model" className="sm:col-span-2">
            <Select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setCost(String(models.find((m) => m._id === e.target.value)?.costPrice ?? ""));
              }}
              aria-label="Phone model"
            >
              {models.map((m) => (
                <option key={m._id} value={m._id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cost of one phone (Rs)">
            <Input type="number" inputMode="decimal" min="0" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Cost per phone" />
          </Field>
          <Field label="Condition">
            <Select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} aria-label="Condition">
              {DEVICE_CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="PTA">
            <Select value={pta} onChange={(e) => setPta(e.target.value as typeof pta)} aria-label="PTA status">
              {PTA_STATUS.map((c) => (
                <option key={c} value={c}>{PTA_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Colour (optional)">
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Black" aria-label="Colour" />
            </Field>
            <Field label="Storage (optional)">
              <Input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="8/256GB" aria-label="Storage" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-sm font-medium text-slate-700">IMEIs</div>
            <ImeiInput
              value={text}
              autoFocus
              onChange={(t, l) => {
                setText(t);
                setLines(l);
              }}
            />
            <p className="mt-2 text-xs text-slate-500">For phones bought from a supplier, use Purchases → New purchase instead (the supplier khata is updated too).</p>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** One phone: its story, plus correct details or remove it (owner / manager). */
function DeviceModal({ device, onClose, onChanged }: { device: DeviceRow | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const can = useCan();
  const [d, setD] = useState<DeviceRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ imei: "", imei2: "", color: "", storage: "", condition: "new", pta: "unknown", price: "", notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditing(false);
    setRemoving(false);
    setReason("");
    if (!device) return setD(null);
    setD(device);
    api<DeviceRow>(`/api/devices/${device._id}`)
      .then(setD)
      .catch(() => {});
  }, [device]);
  useEffect(() => {
    if (d) setForm({ imei: d.imei, imei2: d.imei2 ?? "", color: d.color ?? "", storage: d.storage ?? "", condition: d.condition, pta: d.pta, price: d.price ? String(d.price) : "", notes: d.notes ?? "" });
  }, [d]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { color: form.color, storage: form.storage, condition: form.condition, pta: form.pta, price: form.price === "" ? "" : Number(form.price), notes: form.notes };
      if (d.status === "in_stock") Object.assign(body, { imei: form.imei, imei2: form.imei2 });
      setD(await api<DeviceRow>(`/api/devices/${d._id}`, { method: "PATCH", body }));
      setEditing(false);
      toast.success("Phone details saved");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setBusy(true);
    try {
      setD(await api<DeviceRow>(`/api/devices/${d._id}/remove`, { body: { reason } }));
      setRemoving(false);
      toast.success("Phone removed from stock");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!device} onClose={onClose} title={d ? `${d.productName}` : "Phone"} size="lg">
      {d && !editing && !removing && (
        <>
          <DeviceStory d={d} />
          {d.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{d.notes}</p>}
          {can.manage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Correct details
              </Button>
              {d.status === "in_stock" && (
                <Button variant="outline" className="text-rose-600 hover:bg-rose-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setRemoving(true)}>
                  Remove from stock
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {d && editing && (
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {d.status === "in_stock" ? (
            <>
              <Field label="IMEI">
                <Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} className="font-mono" aria-label="IMEI 1" />
              </Field>
              <Field label="IMEI 2 (optional)">
                <Input value={form.imei2} onChange={(e) => setForm({ ...form, imei2: e.target.value })} className="font-mono" aria-label="IMEI 2" />
              </Field>
            </>
          ) : (
            <p className="text-xs text-slate-500 sm:col-span-2">The IMEI of a sold or returned phone cannot be changed.</p>
          )}
          <Field label="Colour">
            <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label="Colour" />
          </Field>
          <Field label="Storage">
            <Input value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} aria-label="Storage" />
          </Field>
          <Field label="Condition">
            <Select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} aria-label="Condition">
              {DEVICE_CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="PTA">
            <Select value={form.pta} onChange={(e) => setForm({ ...form, pta: e.target.value })} aria-label="PTA status">
              {PTA_STATUS.map((c) => (
                <option key={c} value={c}>{PTA_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Price of this phone (optional)" hint="Empty = the model's sale price">
            <Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} aria-label="Phone price" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[60px]" placeholder="e.g. small scratch on back, box missing" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </form>
      )}
      {d && removing && (
        <form onSubmit={remove} className="space-y-4">
          <p className="text-sm text-slate-600">
            Take <b>{d.productName}</b> (IMEI {d.imei}) out of stock. It stays in the history. Use this for a damaged, lost or wrongly entered phone — not for a sale.
          </p>
          <Field label="Why is it removed?">
            <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Screen broken in the shop" aria-label="Reason" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(false)}>Cancel</Button>
            <Button type="submit" variant="danger" loading={busy}>Remove from stock</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
