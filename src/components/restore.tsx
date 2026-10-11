"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, RotateCcw } from "lucide-react";
import { Button, Field, Input, Modal } from "./ui";
import { useToast } from "./toast";
import { api } from "@/lib/client";

type Summary = { createdAt?: string; shopName?: string; counts: [string, number][]; file: unknown };

const LABELS: Record<string, string> = {
  products: "Products",
  sales: "Bills",
  parties: "Customers & suppliers",
  purchases: "Purchases",
  expenses: "Expenses",
  branches: "Branches",
  recipes: "Recipes",
  saleReturns: "Returns",
  shifts: "Day closes",
  promotions: "Offers",
  stockBatches: "Expiry lots",
  devices: "Phones (IMEI)",
  usedPurchases: "Used phones bought",
  repairs: "Repair jobs",
  wallets: "Easyload SIMs & wallets",
  walletTxns: "Easyload & wallet entries",
  installments: "Installment plans",
};

/**
 * Restore flow: choose file → see what is inside → download a safety copy of the current data
 * → type the shop name → restore.
 */
export function RestoreButton({ shopName, restoreUrl, backupUrl, onDone }: { shopName: string; restoreUrl: string; backupUrl: string; onDone?: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [safetyDone, setSafetyDone] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      // Automatic backups are gzip-compressed (.json.gz); manual ones are plain .json.
      const text = f.name.endsWith(".gz") ? await new Response(f.stream().pipeThrough(new DecompressionStream("gzip"))).text() : await f.text();
      const file = JSON.parse(text);
      if (file?.format !== "dukaan-manager-backup" || !file.data) throw new Error();
      setSummary({
        createdAt: file.createdAt,
        shopName: file.shop?.shopName,
        counts: Object.keys(LABELS).map((k) => [LABELS[k], Array.isArray(file.data[k]) ? file.data[k].length : 0]),
        file,
      });
      setSafetyDone(false);
      setConfirmText("");
      setResult(null);
    } catch {
      toast.error("This file is not a Dukaan Manager backup.");
    }
  }

  async function restore() {
    if (!summary) return;
    setBusy(true);
    try {
      const r = await api<{ restored: number }>(restoreUrl, { body: { backup: summary.file, confirm: confirmText } });
      setResult(r.restored);
      toast.success("Backup restored");
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setSummary(null);
    if (result !== null) window.location.reload();
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".json,.gz,application/json,application/gzip" className="hidden" onChange={onFile} />
      <Button type="button" size="sm" variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
        Restore from backup
      </Button>
      <Modal open={!!summary} onClose={close} title="Restore from backup" size="md">
        {summary && result === null && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <div className="font-semibold text-slate-800">{summary.shopName}</div>
              <div className="text-slate-500">Backup made {summary.createdAt ? new Date(summary.createdAt).toLocaleString("en-PK") : "(date unknown)"}</div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
                {summary.counts.map(([label, n]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-500">{label}</span>
                    <b>{n}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                Everything in <b>{shopName}</b> (products, stock, bills, khata, purchases, expenses) will be <b>replaced</b> with this backup. Staff logins are kept.
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Step 1 — keep a copy of today&apos;s data</div>
              <a href={backupUrl} onClick={() => setSafetyDone(true)}>
                <Button type="button" variant={safetyDone ? "secondary" : "primary"} icon={safetyDone ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}>
                  {safetyDone ? "Safety copy downloaded" : "Download safety copy"}
                </Button>
              </a>
            </div>
            <Field label={`Step 2 — type the shop name "${shopName}" to confirm`}>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} disabled={!safetyDone} placeholder={shopName} />
            </Field>
            <Button
              variant="danger"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={!safetyDone || confirmText.trim().toLowerCase() !== shopName.trim().toLowerCase()}
              icon={<FileUp className="h-5 w-5" />}
              onClick={restore}
            >
              Replace data with this backup
            </Button>
          </div>
        )}
        {result !== null && (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-brand-500" />
            <p className="mt-3 text-lg font-bold text-slate-900">Restore complete</p>
            <p className="text-sm text-slate-500">{result} records restored.</p>
            <Button className="mt-6" onClick={close}>Done</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
