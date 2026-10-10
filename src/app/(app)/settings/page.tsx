"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Download, FileUp, KeyRound, Plus, RefreshCw, Save, ShieldCheck, Store, UserCog, Users } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Textarea } from "@/components/ui";
import { useSession, type ShopSettings } from "@/components/session";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

type User = { _id: string; name: string; username: string; role: "owner" | "manager" | "cashier"; active: boolean };
type SettingsForm = ShopSettings & { ownerName?: string; fbrToken?: string; fbrTokenSet?: boolean; fbrPending?: number };

const ROLE_INFO = {
  owner: { label: "Owner", color: "violet" as const, text: "Full access, including settings and users" },
  manager: { label: "Manager", color: "blue" as const, text: "Products, purchases, production, expenses, reports, returns" },
  cashier: { label: "Cashier", color: "slate" as const, text: "Make bills and receive udhaar payments only" },
};

export default function SettingsPage() {
  const toast = useToast();
  const { user: me, reload } = useSession();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<{ users: User[]; maxUsers: number; activeUsers: number } | null>(null);
  const [userModal, setUserModal] = useState<User | "new" | null>(null);

  const loadUsers = useCallback(() => {
    api<{ users: User[]; maxUsers: number; activeUsers: number }>("/api/users").then(setTeam).catch(() => {});
  }, []);
  const loadSettings = useCallback(() => {
    api<SettingsForm>("/api/settings").then((s) => setForm({ ...s, fbrToken: "" })).catch((e) => toast.error(e.message));
  }, [toast]);

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, [loadSettings, loadUsers]);

  if (!form) return <Spinner />;
  const set = (k: keyof SettingsForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        body: {
          shopName: form.shopName,
          shopType: form.shopType,
          ownerName: form.ownerName,
          phone: form.phone,
          address: form.address,
          ntn: form.ntn,
          strn: form.strn,
          taxEnabled: form.taxEnabled,
          taxRate: form.taxRate,
          pricesIncludeTax: form.pricesIncludeTax,
          receiptFooter: form.receiptFooter,
          fbrEnabled: form.fbrEnabled,
          fbrMode: form.fbrMode,
          fbrPosId: form.fbrPosId ?? "",
          fbrDefaultPct: form.fbrDefaultPct,
          fbrToken: form.fbrToken,
        },
      });
      toast.success("Settings saved");
      reload();
      loadSettings();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const full = team ? team.activeUsers >= team.maxUsers : false;

  return (
    <div>
      <PageHeader title="Settings" urdu="ترتیبات" subtitle="Shop details, tax, FBR, staff accounts and data" />
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><Store className="h-5 w-5 text-brand-600" /> Shop details</h2>
          <div className="space-y-4">
            <Field label="Shop name"><Input required value={form.shopName} onChange={set("shopName")} /></Field>
            <Field label="Shop type">
              <Select value={form.shopType} onChange={set("shopType")}>
                <option value="karyana">Karyana Store</option>
                <option value="general">General Store</option>
                <option value="bakery">Bakery</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner name"><Input value={form.ownerName ?? ""} onChange={set("ownerName")} /></Field>
              <Field label="Phone"><Input value={form.phone ?? ""} onChange={set("phone")} /></Field>
            </div>
            <Field label="Address"><Input value={form.address ?? ""} onChange={set("address")} /></Field>
            <Field label="Message at bottom of receipt"><Textarea value={form.receiptFooter ?? ""} onChange={set("receiptFooter")} className="min-h-[60px]" /></Field>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-brand-600" /> Sales tax</h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="NTN"><Input value={form.ntn ?? ""} onChange={set("ntn")} placeholder="Optional" /></Field>
                <Field label="STRN"><Input value={form.strn ?? ""} onChange={set("strn")} placeholder="Optional" /></Field>
              </div>
              <Toggle checked={form.taxEnabled} onChange={(v) => setForm({ ...form, taxEnabled: v })} title="Charge sales tax on bills" text="Turn on if you are registered with FBR for sales tax." />
              {form.taxEnabled && (
                <>
                  <Field label="Sales tax rate (%)"><Input type="number" min="0" max="100" step="any" value={form.taxRate} onChange={set("taxRate")} /></Field>
                  <Toggle checked={form.pricesIncludeTax} onChange={(v) => setForm({ ...form, pricesIncludeTax: v })} title="My prices already include tax" text="If off, tax is added on top of the price at billing." />
                </>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-brand-600" /> FBR POS integration</h2>
              {form.fbrEnabled && <Badge color={form.fbrMode === "live" ? "green" : "amber"}>{form.fbrMode === "live" ? "Live" : "Sandbox"}</Badge>}
            </div>
            <div className="space-y-4">
              <Toggle
                checked={!!form.fbrEnabled}
                onChange={(v) => setForm({ ...form, fbrEnabled: v })}
                title="Send every bill to FBR"
                text="For Tier-1 retailers. FBR's invoice number and QR code will be printed on each receipt."
              />
              {form.fbrEnabled && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Mode">
                      <Select value={form.fbrMode ?? "sandbox"} onChange={set("fbrMode")}>
                        <option value="sandbox">Sandbox (testing)</option>
                        <option value="live">Live</option>
                      </Select>
                    </Field>
                    <Field label="POS ID" hint="Given by FBR when you register your POS">
                      <Input inputMode="numeric" value={form.fbrPosId ?? ""} onChange={set("fbrPosId")} />
                    </Field>
                  </div>
                  <Field label="Access token" hint={form.fbrTokenSet ? "A token is saved. Type a new one only to replace it." : "Bearer token from FBR"}>
                    <Input type="password" value={form.fbrToken ?? ""} onChange={set("fbrToken")} placeholder={form.fbrTokenSet ? "••••••••••••" : ""} autoComplete="off" />
                  </Field>
                  <Field label="Default PCT code" hint="Used for products without their own PCT code">
                    <Input value={form.fbrDefaultPct ?? ""} onChange={set("fbrDefaultPct")} />
                  </Field>
                  <FbrPending count={form.fbrPending ?? 0} onDone={loadSettings} />
                </>
              )}
            </div>
          </Card>
          <Button type="submit" size="lg" className="w-full" loading={saving} icon={<Save className="h-5 w-5" />}>Save settings</Button>
        </div>
      </form>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-5 w-5 text-brand-600" /> Staff accounts</h2>
            {team && (
              <p className={`text-xs ${full ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                {team.activeUsers} of {team.maxUsers} users used{full && " — limit reached. Ask the administrator for more users."}
              </p>
            )}
          </div>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={full} onClick={() => setUserModal("new")}>Add staff</Button>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {team?.users.map((u) => (
              <tr key={u._id}>
                <Td className="font-semibold">{u.name}{u._id === me.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</Td>
                <Td className="text-slate-500">{u.username}</Td>
                <Td><Badge color={ROLE_INFO[u.role].color}>{ROLE_INFO[u.role].label}</Badge></Td>
                <Td>{u.active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" icon={<UserCog className="h-4 w-4" />} onClick={() => setUserModal(u)}>Edit</Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <DataCard />

      <UserModal value={userModal} isSelf={userModal !== "new" && userModal?._id === me.id} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); loadUsers(); }} />
    </div>
  );
}

function Toggle({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
      <span>
        <span className="block font-semibold text-slate-800">{title}</span>
        <span className="text-sm text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function FbrPending({ count, onDone }: { count: number; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    try {
      const r = await api<{ tried: number; synced: number; remaining: number }>("/api/fbr/sync", { method: "POST" });
      if (r.remaining) toast.error(`${r.synced} sent, ${r.remaining} still waiting. Check your internet, POS ID and token.`);
      else toast.success(`${r.synced} bill(s) sent to FBR`);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`flex items-center justify-between rounded-xl p-3 text-sm ${count ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
      <span>{count ? `${count} bill(s) waiting to be sent to FBR` : "All bills have been sent to FBR"}</span>
      {count > 0 && (
        <Button type="button" size="sm" variant="outline" loading={busy} icon={<RefreshCw className="h-4 w-4" />} onClick={sync}>
          Send now
        </Button>
      )}
    </div>
  );
}

const TEMPLATE = "name,nameUrdu,barcode,category,unit,costPrice,salePrice,stock,lowStockAlert,expiryDate,pctCode\nSugar,چینی,,Sugar & Salt,kg,140,160,50,10,,\nOlpers Milk 1L,,8961014000123,Dairy,pcs,280,300,24,6,2026-12-31,\n";

function DataCard() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[]; errorCount: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const csv = await file.text();
      const r = await api<{ created: number; updated: number; errors: string[]; errorCount: number }>("/api/import/products", { body: { csv } });
      setResult(r);
      toast.success(`Import done: ${r.created} added, ${r.updated} updated`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const exports = [
    ["products", "Products"],
    ["customers", "Customers"],
    ["suppliers", "Suppliers"],
    ["sales", "Sales (30 days)"],
    ["expenses", "Expenses (30 days)"],
  ];

  return (
    <Card className="mt-6 p-6">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-900"><Database className="h-5 w-5 text-brand-600" /> Data, import & backup</h2>
      <p className="mb-5 text-sm text-slate-500">Download your data as Excel-friendly CSV files, add many products at once, or keep a full backup.</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Export to Excel (CSV)</h3>
          <div className="flex flex-wrap gap-2">
            {exports.map(([type, label]) => (
              <a key={type} href={`/api/export/${type}`}>
                <Button type="button" size="sm" variant="outline" icon={<Download className="h-4 w-4" />}>{label}</Button>
              </a>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Import products from CSV</h3>
          <p className="mb-2 text-xs text-slate-500">Existing products (same barcode or name) are updated; new ones are added.</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Button type="button" size="sm" loading={importing} icon={<FileUp className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <Button type="button" size="sm" variant="ghost" onClick={downloadTemplate}>Download template</Button>
          </div>
          {result && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div><b>{result.created}</b> added · <b>{result.updated}</b> updated · <b className={result.errorCount ? "text-rose-600" : ""}>{result.errorCount}</b> skipped</div>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs text-rose-700">
                  {result.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Full backup</h3>
          <p className="mb-2 text-xs text-slate-500">One file with all products, bills, khata, purchases and expenses. Keep it safe (e.g. USB or Google Drive).</p>
          <a href="/api/backup">
            <Button type="button" size="sm" variant="outline" icon={<Download className="h-4 w-4" />}>Download backup</Button>
          </a>
        </div>
      </div>
    </Card>
  );
}

function UserModal({ value, isSelf, onClose, onSaved }: { value: User | "new" | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "cashier", active: true });
  const [saving, setSaving] = useState(false);
  const isNew = value === "new";

  useEffect(() => {
    if (!value) return;
    if (value === "new") setForm({ name: "", username: "", password: "", role: "cashier", active: true });
    else setForm({ name: value.name, username: value.username, password: "", role: value.role, active: value.active });
  }, [value]);
  if (!value) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) await api("/api/users", { body: form });
      else await api(`/api/users/${(value as User)._id}`, { method: "PUT", body: { name: form.name, role: form.role, active: form.active, password: form.password } });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Add staff member" : `Edit ${form.name}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Username" hint={isNew ? "Small letters or numbers, no spaces" : undefined}>
          <Input required disabled={!isNew} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
        </Field>
        <Field label={isNew ? "Password" : "New password"} hint={isNew ? "At least 6 characters" : "Leave empty to keep the old password"}>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input type="password" required={isNew} minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pl-10" autoComplete="new-password" />
          </div>
        </Field>
        <Field label="Role">
          <div className="space-y-2">
            {(Object.keys(ROLE_INFO) as (keyof typeof ROLE_INFO)[]).map((r) => (
              <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${form.role === r ? "border-brand-600 bg-brand-50" : "border-slate-200"} ${isSelf ? "opacity-60" : ""}`}>
                <input type="radio" name="role" disabled={isSelf} checked={form.role === r} onChange={() => setForm({ ...form, role: r })} className="mt-1 accent-brand-600" />
                <span>
                  <span className="block font-semibold">{ROLE_INFO[r].label}</span>
                  <span className="text-xs text-slate-500">{ROLE_INFO[r].text}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        {!isNew && !isSelf && (
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 accent-brand-600" />
            <span className="font-medium">Account active (can log in)</span>
          </label>
        )}
        <Button type="submit" size="lg" className="w-full" loading={saving}>Save</Button>
      </form>
    </Modal>
  );
}
