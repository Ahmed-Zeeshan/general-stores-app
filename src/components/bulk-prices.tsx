"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Badge, Button, Field, Input, Modal, Segmented, Select, Spinner, Table, Td, Th } from "./ui";
import { useConfirm } from "./confirm";
import { useToast } from "./toast";
import { api, UNIT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Category = { _id: string; name: string };
type PreviewRow = { _id: string; name: string; unit: string; from: number; to: number; belowCost: boolean; skip: boolean };
type Preview = { scope: string; total: number; changing: number; belowCost: number; skipped: number; rows: PreviewRow[] };

/** Raise or lower many prices at once: a category or all items, by % or Rs, with rounding and a preview. */
export function BulkPriceModal({ open, categories, onClose, onDone }: { open: boolean; categories: Category[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [scope, setScope] = useState("all");
  const [field, setField] = useState<"salePrice" | "wholesalePrice">("salePrice");
  const [dir, setDir] = useState<"up" | "down">("up");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [round, setRound] = useState("0");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPreview(null);
      setValue("");
    }
  }, [open]);

  const n = Number(value);
  const body = () => ({
    scope: scope === "all" ? "all" : "category",
    ...(scope !== "all" ? { categoryId: scope } : {}),
    field,
    mode,
    value: dir === "up" ? n : -n,
    round: Number(round),
  });

  // Fresh preview whenever a setting changes.
  useEffect(() => {
    if (!open || !(n > 0)) return setPreview(null);
    const timer = setTimeout(() => {
      api<Preview>("/api/products/bulk-price", { body: { ...body(), preview: true } })
        .then(setPreview)
        .catch((e) => toast.error(e.message));
    }, 250);
    return () => clearTimeout(timer);
    // body() reads the same settings listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, field, dir, mode, value, round]);

  async function apply() {
    if (!preview) return;
    const how = mode === "percent" ? `${dir === "up" ? "+" : "−"}${n}%` : `${dir === "up" ? "+" : "−"}Rs ${n}`;
    const ok = await confirm({
      title: t("Change {n} prices?", { n: preview.changing }),
      message: t("{field} of {scope}: {how}.", { field: t(field === "salePrice" ? "Sale price" : "Wholesale price"), scope: preview.scope === "all items" ? t("all items") : preview.scope, how }),
      points: [t("The old prices are kept in each item's price history."), ...(preview.belowCost ? [t("{n} items will sell below their cost price.", { n: preview.belowCost })] : [])],
      tone: preview.belowCost ? "warning" : undefined,
      confirmLabel: t("Change prices"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api<{ changed: number }>("/api/products/bulk-price", { body: body() });
      toast.success(t("{n} prices changed", { n: r.changed }));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Update prices"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<TrendingUp className="h-4 w-4" />} disabled={!preview?.changing} loading={busy} onClick={apply}>
            {preview?.changing ? t("Change {n} prices", { n: preview.changing }) : t("Change prices")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Which items">
          <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Which items">
            <option value="all">{t("All items")}</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Which price">
          <Segmented
            value={field}
            onChange={setField}
            options={[
              { value: "salePrice", label: "Sale price" },
              { value: "wholesalePrice", label: "Wholesale price" },
            ]}
          />
        </Field>
        <Field label="Change">
          <div className="flex flex-wrap gap-2">
            <Segmented
              value={dir}
              onChange={setDir}
              options={[
                { value: "up", label: "Increase" },
                { value: "down", label: "Decrease" },
              ]}
            />
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "percent", label: "%" },
                { value: "amount", label: "Rs" },
              ]}
            />
          </div>
        </Field>
        <Field label={mode === "percent" ? "By how many %" : "By how many rupees (per unit)"}>
          <Input type="number" inputMode="decimal" min="0" step="any" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Change by" placeholder={mode === "percent" ? "5" : "10"} />
        </Field>
        <Field label="Round the new price" className="sm:col-span-2">
          <Segmented
            value={round}
            onChange={setRound}
            options={[
              { value: "0", label: "No rounding" },
              { value: "1", label: "Rs 1" },
              { value: "5", label: "Rs 5" },
              { value: "10", label: "Rs 10" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-5">
        {!(n > 0) ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{t("Type how much to change the prices; the new prices show here before anything is saved.")}</p>
        ) : !preview ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <b>{t("{n} prices will change", { n: preview.changing })}</b>
              {field === "wholesalePrice" && <span className="text-slate-500">· {t("only items that have a wholesale price")}</span>}
              {preview.belowCost > 0 && (
                <Badge color="red">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                  {t("{n} below cost", { n: preview.belowCost })}
                </Badge>
              )}
              {preview.skipped > 0 && <Badge color="amber">{t("{n} skipped (price would be 0)", { n: preview.skipped })}</Badge>}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              <Table stack={false}>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th className="text-right">Now</Th>
                    <Th className="text-right">New</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r._id} className={r.skip ? "opacity-50" : undefined}>
                      <Td>
                        {r.name}
                        {r.belowCost && <span className="ml-2 text-xs font-semibold text-rose-600">{t("below cost")}</span>}
                      </Td>
                      <Td className="text-right text-slate-500">
                        {formatPKR(r.from)} / {t(UNIT_LABELS[r.unit] ?? r.unit)}
                      </Td>
                      <Td className="text-right font-semibold">{r.skip ? "—" : formatPKR(r.to)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
