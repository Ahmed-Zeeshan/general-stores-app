"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ScanBarcode, Smartphone } from "lucide-react";
import { Badge, Button, Input, Modal, Spinner, Textarea, cn } from "./ui";
import { useBarcodeScanner } from "./barcode-scanner";
import { api } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { CONDITION_LABELS, cleanImei, parseImeiLines, type ImeiLine } from "@/lib/imei";

export type DeviceRow = {
  _id: string;
  product: string;
  productName: string;
  branch: string;
  imei: string;
  imei2?: string;
  color?: string;
  storage?: string;
  condition: "new" | "used" | "refurbished";
  pta: "approved" | "non_pta" | "unknown";
  cost?: number;
  price?: number;
  notes?: string;
  status: "in_stock" | "sold" | "returned" | "removed";
  source?: { type: string; id?: string; refNo?: string; name?: string };
  sale?: { id?: string; invoiceNo: string; customerName?: string; at: string; price?: number; warrantyUntil?: string };
  history?: { at: string; action: string; refNo?: string; note?: string; userName?: string }[];
  createdAt: string;
  updatedAt: string;
};

/** Colour, storage, condition and PTA of a phone as small labels. */
export function DeviceTags({ d }: { d: Pick<DeviceRow, "color" | "storage" | "condition" | "pta"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {d.color && <Badge>{d.color}</Badge>}
      {d.storage && <Badge>{d.storage}</Badge>}
      {d.condition !== "new" && <Badge color="amber">{CONDITION_LABELS[d.condition]}</Badge>}
      {d.pta === "approved" ? <Badge color="green">PTA</Badge> : d.pta === "non_pta" ? <Badge color="red">Non-PTA</Badge> : null}
    </span>
  );
}

/** IMEI with the second IMEI underneath (monospace so digits line up). */
export function Imei({ d }: { d: { imei: string; imei2?: string } }) {
  return (
    <span className="font-mono text-[13px] tracking-tight">
      {d.imei}
      {d.imei2 && <span className="block text-xs text-slate-400">{d.imei2}</span>}
    </span>
  );
}

/**
 * Box to type or scan IMEIs, one phone per line (second IMEI after a comma). Shows how many phones
 * were read and any problems as you go.
 */
export function ImeiInput({
  value,
  onChange,
  expected,
  autoFocus,
}: {
  value: string;
  onChange: (text: string, lines: ImeiLine[]) => void;
  /** Number of phones this should match (e.g. purchase quantity). */
  expected?: number;
  autoFocus?: boolean;
}) {
  const lines = useMemo(() => parseImeiLines(value), [value]);
  const blocking = lines.filter((l) => l.blocking).length;
  const warnings = lines.filter((l) => l.problem && !l.blocking).length;
  return (
    <div>
      <Textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value, parseImeiLines(e.target.value))}
        placeholder={"Scan or type one phone per line\n356789012345678\n356789012345686, 356789012345694   ← IMEI 2 after a comma"}
        className="min-h-[120px] font-mono text-sm"
        aria-label="IMEIs"
        spellCheck={false}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("font-semibold", expected !== undefined && lines.length !== expected ? "text-amber-700" : "text-slate-600")}>
          {lines.length} phone{lines.length === 1 ? "" : "s"}
          {expected !== undefined && ` of ${expected}`}
        </span>
        {blocking > 0 && <span className="font-semibold text-rose-600">{blocking} to fix</span>}
        {warnings > 0 && <span className="text-amber-700">{warnings} with a wrong check digit (allowed — re-check)</span>}
      </div>
      {lines.some((l) => l.problem) && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {lines.map((l, i) =>
            l.problem ? (
              <li key={i} className={l.blocking ? "text-rose-600" : "text-amber-700"}>
                Line {i + 1}: {l.imei || "(empty)"} — {l.problem}
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Choose phones of a model by IMEI (search, tap or scan). Shows the in-stock phones at this branch,
 * or the `list` given (e.g. phones on a bill).
 */
export function DevicePicker({
  open,
  onClose,
  product,
  list,
  exclude = [],
  multiple = false,
  title,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  product: { _id: string; name: string } | null;
  list?: DeviceRow[];
  exclude?: string[];
  multiple?: boolean;
  title?: string;
  onPick: (devices: DeviceRow[]) => void;
}) {
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (!open || !product) return;
    setQ("");
    setPicked([]);
    if (list) {
      setRows(list);
      return;
    }
    setRows(null);
    api<DeviceRow[]>(`/api/devices?product=${product._id}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [open, product, list]);

  const available = (rows ?? []).filter((d) => !exclude.includes(d._id));
  const term = cleanImei(q);
  const shown = available.filter((d) => {
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return d.imei.includes(term) || d.imei2?.includes(term) || d.color?.toLowerCase().includes(t) || d.storage?.toLowerCase().includes(t);
  });

  function choose(d: DeviceRow) {
    if (!multiple) {
      onPick([d]);
      return;
    }
    setPicked((p) => (p.includes(d._id) ? p.filter((x) => x !== d._id) : [...p, d._id]));
  }
  // A scanned IMEI picks that phone straight away.
  useBarcodeScanner((code) => {
    const c = cleanImei(code);
    const hit = available.find((d) => d.imei === c || d.imei2 === c);
    if (hit) choose(hit);
    else setQ(code);
  }, open);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? `Choose ${product?.name ?? "phone"}`}
      size="md"
      footer={
        multiple ? (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!picked.length} onClick={() => onPick(available.filter((d) => picked.includes(d._id)))}>
              Choose {picked.length || ""} phone{picked.length === 1 ? "" : "s"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="relative">
        <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length === 1) {
              e.preventDefault();
              choose(shown[0]);
            }
          }}
          placeholder="Scan the IMEI, or search IMEI / colour"
          className="pl-10"
          aria-label="Search IMEI"
        />
      </div>
      <div className="mt-3">
        {!rows ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <Smartphone className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            {available.length === 0 ? "No phones of this model in stock here." : "No phone matches. Check the IMEI."}
          </div>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {shown.map((d) => {
              const on = picked.includes(d._id);
              return (
                <li key={d._id}>
                  <button
                    type="button"
                    onClick={() => choose(d)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-50/50", on && "bg-brand-50")}
                    aria-label={`IMEI ${d.imei}`}
                  >
                    {multiple && <input type="checkbox" readOnly checked={on} className="h-4 w-4 shrink-0 accent-brand-600" tabIndex={-1} />}
                    <div className="min-w-0 flex-1">
                      <Imei d={d} />
                      <div className="mt-1">
                        <DeviceTags d={d} />
                      </div>
                    </div>
                    {d.price ? <span className="shrink-0 text-sm font-semibold text-slate-800">{formatPKR(d.price)}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** Small status line for an IMEI check result. */
export function CheckDigit({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> IMEI check digit OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" /> Check digit does not match — the IMEI may be typed wrong or the phone may be a copy
    </span>
  );
}

