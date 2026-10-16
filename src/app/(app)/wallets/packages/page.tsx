"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package2, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td, Th } from "@/components/ui";
import { useCan } from "@/components/session";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { OPERATORS, OPERATOR_LABELS, PACKAGE_KINDS, PACKAGE_KIND_LABELS } from "@/lib/constants";
import { useT } from "@/lib/i18n";

type Pkg = { _id: string; operator: string; name: string; kind: string; data?: string; minutes?: string; sms?: string; validityDays?: number; price: number; commission?: number; code?: string; active: boolean };

export default function PackagesPage() {
  const toast = useToast();
  const t = useT();
  const can = useCan();
  const [operator, setOperator] = useState<string>("all");
  const [rows, setRows] = useState<Pkg[] | null>(null);
  const [editing, setEditing] = useState<Pkg | "new" | null>(null);
  const load = useCallback(() => {
    api<Pkg[]>(`/api/packages?all=1${operator !== "all" ? `&operator=${operator}` : ""}`)
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, [operator, toast]);
  useEffect(load, [load]);
  return (
    <div>
      <Link href="/wallets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {t("Easyload & wallets")}
      </Link>
      <PageHeader
        title="Internet & Call Packages"
        urdu="انٹرنیٹ اور کال پیکجز"
        subtitle="Your price list of Jazz, Zong, Telenor, Ufone and Onic packages — sold in one tap from Easyload & Wallets"
        actions={can.manage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add package</Button>}
      />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Segmented value={operator} onChange={setOperator} options={[{ value: "all", label: "All" }, ...OPERATORS.map((o) => ({ value: o, label: OPERATOR_LABELS[o] }))]} />
        </div>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Package2 className="h-7 w-7" />} title="No packages yet" text="Add the packages you sell with their current price (prices change often — keep this list up to date)." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Package</Th>
                <Th>Network</Th>
                <Th>Gives</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Commission</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id} className={p.active ? "" : "opacity-50"}>
                  <Td>
                    <div className="font-semibold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {t(PACKAGE_KIND_LABELS[p.kind])}
                      {p.code && ` · ${p.code}`}
                    </div>
                    {!p.active && <Badge color="slate">Not sold</Badge>}
                  </Td>
                  <Td>{OPERATOR_LABELS[p.operator]}</Td>
                  <Td className="text-slate-600">{[p.data, p.minutes, p.sms, p.validityDays ? t(p.validityDays === 1 ? "{n} day" : "{n} days", { n: p.validityDays }) : null].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td className="text-right font-semibold">{formatPKR(p.price)}</Td>
                  <Td className="text-right text-slate-500">{p.commission !== undefined && p.commission !== null ? formatPKR(p.commission) : t("SIM %")}</Td>
                  <Td className="text-right">
                    {can.manage && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <PackageForm pkg={editing} defaultOperator={operator === "all" ? "jazz" : operator} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function PackageForm({ pkg, defaultOperator, onClose, onSaved }: { pkg: Pkg | "new" | null; defaultOperator: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
  const isNew = pkg === "new";
  const blank = { operator: defaultOperator, name: "", kind: "internet", data: "", minutes: "", sms: "", validityDays: "", price: "", commission: "", code: "", active: true };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!pkg) return;
    if (pkg === "new") setF({ ...blank, operator: defaultOperator });
    else setF({ operator: pkg.operator, name: pkg.name, kind: pkg.kind, data: pkg.data ?? "", minutes: pkg.minutes ?? "", sms: pkg.sms ?? "", validityDays: pkg.validityDays ? String(pkg.validityDays) : "", price: String(pkg.price), commission: pkg.commission !== undefined && pkg.commission !== null ? String(pkg.commission) : "", code: pkg.code ?? "", active: pkg.active });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, defaultOperator]);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...f, price: Number(f.price), validityDays: f.validityDays === "" ? undefined : Number(f.validityDays), commission: f.commission === "" ? "" : Number(f.commission) };
      if (isNew) await api("/api/packages", { body });
      else await api(`/api/packages/${(pkg as Pkg)._id}`, { method: "PATCH", body });
      toast.success(t("Package saved"));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={!!pkg} onClose={onClose} title={isNew ? "Add package" : "Edit package"} size="md">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Network">
          <Select value={f.operator} onChange={set("operator")} aria-label="Network">
            {OPERATORS.map((o) => (
              <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.kind} onChange={set("kind")} aria-label="Package type">
            {PACKAGE_KINDS.map((k) => (
              <option key={k} value={k}>{t(PACKAGE_KIND_LABELS[k])}</option>
            ))}
          </Select>
        </Field>
        <Field label="Package name" className="sm:col-span-2">
          <Input required minLength={2} value={f.name} onChange={set("name")} placeholder={t("e.g. {n}", { n: "Weekly Super Plus" })} aria-label="Package name" />
        </Field>
        <Field label="Internet">
          <Input value={f.data} onChange={set("data")} placeholder="30 GB" aria-label="Data" />
        </Field>
        <Field label="Minutes">
          <Input value={f.minutes} onChange={set("minutes")} placeholder={t("1500 on-net")} aria-label="Minutes" />
        </Field>
        <Field label="SMS">
          <Input value={f.sms} onChange={set("sms")} placeholder="1500" aria-label="SMS" />
        </Field>
        <Field label="Valid for (days)">
          <Input type="number" min="0" value={f.validityDays} onChange={set("validityDays")} aria-label="Validity days" />
        </Field>
        <Field label="Price for the customer (Rs)">
          <Input required type="number" min="1" value={f.price} onChange={set("price")} aria-label="Price" />
        </Field>
        <Field label="Commission (Rs)" hint="Empty = the SIM's commission %">
          <Input type="number" min="0" step="any" value={f.commission} onChange={set("commission")} aria-label="Commission" />
        </Field>
        <Field label="How to activate (optional)" className="sm:col-span-2">
          <Input value={f.code} onChange={set("code")} placeholder={t("e.g. Retailer app → Bundles, or *453#")} aria-label="Activation code" />
        </Field>
        {!isNew && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-brand-600" /> {t("Still sold")}
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
