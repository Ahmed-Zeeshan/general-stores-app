"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Database, Download, FileUp, Gift, KeyRound, LayoutGrid, Printer, MapPin, MessageCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Store, UserCog, Users } from "lucide-react";
import { MODULE_INFO, MODULES, SHOP_TYPE_LABELS, SHOP_TYPES } from "@/lib/constants";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Textarea } from "@/components/ui";
import { useSession, type ShopSettings } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { getPrintPrefs, printInFrame, setPrintPrefs, type PrintPrefs } from "@/lib/print";
import { RestoreButton } from "@/components/restore";
import { WaModePicker } from "@/components/wa-mode";
import { DEFAULT_WA_PAYMENT_TEMPLATE, DEFAULT_WA_TEMPLATE, paymentMessage, reminderMessage } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n";

type User = { _id: string; name: string; username: string; role: "owner" | "manager" | "cashier"; active: boolean; branch?: string; hasPin?: boolean; maxDiscountPct?: number; allowUdhaar?: boolean };
type BranchRow = { _id: string; name: string; address?: string; phone?: string; isMain: boolean; active: boolean; staff: number };
type BranchData = { branches: BranchRow[]; maxBranches: number; activeBranches: number };
type SettingsForm = ShopSettings & { ownerName?: string; fbrToken?: string; fbrTokenSet?: boolean; fbrPending?: number };

const ROLE_INFO = {
  owner: { label: "Owner", color: "violet" as const, text: "Full access, including settings and users" },
  manager: { label: "Manager", color: "blue" as const, text: "Products, purchases, production, expenses, reports, returns" },
  cashier: { label: "Cashier", color: "slate" as const, text: "Make bills and receive udhaar payments only" },
};

export default function SettingsPage() {
  const toast = useToast();
  const t = useT();
  const { user: me, reload } = useSession();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<{ users: User[]; maxUsers: number; activeUsers: number } | null>(null);
  const [userModal, setUserModal] = useState<User | "new" | null>(null);
  const [branchData, setBranchData] = useState<BranchData | null>(null);
  const loadBranches = useCallback(() => {
    api<BranchData>("/api/branches").then(setBranchData).catch(() => {});
  }, []);
  useEffect(loadBranches, [loadBranches]);
  const activeBranches = branchData?.branches.filter((b) => b.active) ?? [];
  const branchName = (id?: string) => branchData?.branches.find((b) => b._id === id)?.name;

  const loadUsers = useCallback(() => {
    api<{ users: User[]; maxUsers: number; activeUsers: number }>("/api/users").then(setTeam).catch(() => {});
  }, []);
  const loadSettings = useCallback(() => {
    api<SettingsForm>("/api/settings")
      .then((s) => setForm({ ...s, fbrToken: "" }))
      .catch((e) => toast.error(e.message));
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
          waTemplate: form.waTemplate,
          waPaymentTemplate: form.waPaymentTemplate,
          publicUrl: form.publicUrl ?? "",
          ownerPhone: form.ownerPhone ?? "",
          loyaltyEnabled: !!form.loyaltyEnabled,
          requireOpenDrawer: !!form.requireOpenDrawer,
          loyaltyEarnPer: Number(form.loyaltyEarnPer) || 100,
          loyaltyPointValue: Number(form.loyaltyPointValue) || 0,
          loyaltyMinRedeem: Number(form.loyaltyMinRedeem) || 0,
          modules: Object.fromEntries(MODULES.map((m) => [m, !!form.modules?.[m]])),
        },
      });
      toast.success(t("Settings saved"));
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
          <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><Store className="h-5 w-5 text-brand-600" /> {t("Shop details")}</h2>
          <div className="space-y-4">
            <Field label="Shop name"><Input required value={form.shopName} onChange={set("shopName")} /></Field>
            <Field label="Shop type">
              <Select value={form.shopType} onChange={set("shopType")}>
                {SHOP_TYPES.map((st) => (
                  <option key={st} value={st}>{t(SHOP_TYPE_LABELS[st])}</option>
                ))}
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
            <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-brand-600" /> {t("Sales tax")}</h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="NTN"><Input value={form.ntn ?? ""} onChange={set("ntn")} placeholder={t("Optional")} /></Field>
                <Field label="STRN"><Input value={form.strn ?? ""} onChange={set("strn")} placeholder={t("Optional")} /></Field>
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
              <h2 className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-brand-600" /> {t("FBR POS integration")}</h2>
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
                        <option value="sandbox">{t("Sandbox (testing)")}</option>
                        <option value="live">{t("Live")}</option>
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
          <PrintingCard />
          <Card className="p-6">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-900"><LayoutGrid className="h-5 w-5 text-brand-600" /> {t("Features")}</h2>
            <p className="mb-4 text-sm text-slate-500">{t("Switch on what your shop needs. Mobile phone shops usually use all four; a karyana store can switch on just Easyload & wallets.")}</p>
            <div className="space-y-3">
              {MODULES.map((m) => (
                <Toggle
                  key={m}
                  checked={!!form.modules?.[m]}
                  onChange={(v) => setForm({ ...form, modules: { ...form.modules, [m]: v } })}
                  title={MODULE_INFO[m].label}
                  text={MODULE_INFO[m].hint}
                />
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><Banknote className="h-5 w-5 text-brand-600" /> {t("Cash drawer")}</h2>
            <Toggle
              checked={!!form.requireOpenDrawer}
              onChange={(v) => setForm({ ...form, requireOpenDrawer: v })}
              title="Make bills only when the cash drawer is open"
              text="Before the first bill of the day, the cashier must open the drawer and count the cash in it, so every rupee is tracked for the day close. Bills made while the internet was off are still accepted."
            />
          </Card>
          <Card className="p-6">
            <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><Gift className="h-5 w-5 text-violet-600" /> {t("Loyalty points")}</h2>
            <div className="space-y-4">
              <Toggle checked={!!form.loyaltyEnabled} onChange={(v) => setForm({ ...form, loyaltyEnabled: v })} title="Give customers loyalty points" text="Customers chosen on a bill earn points on what they pay and can spend them later as a discount." />
              {form.loyaltyEnabled && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="1 point for every (Rs)">
                    <Input type="number" min="1" value={form.loyaltyEarnPer ?? 100} onChange={(e) => setForm({ ...form, loyaltyEarnPer: Number(e.target.value) })} aria-label="Rupees per point" />
                  </Field>
                  <Field label="1 point is worth (Rs)">
                    <Input type="number" min="0" step="any" value={form.loyaltyPointValue ?? 1} onChange={(e) => setForm({ ...form, loyaltyPointValue: Number(e.target.value) })} aria-label="Point value" />
                  </Field>
                  <Field label="Spend from (points)">
                    <Input type="number" min="0" value={form.loyaltyMinRedeem ?? 100} onChange={(e) => setForm({ ...form, loyaltyMinRedeem: Number(e.target.value) })} aria-label="Minimum points" />
                  </Field>
                  <p className="text-xs text-slate-500 sm:col-span-3">
                    {t("Example: a Rs {n} bill earns 20 points = {value} off a later bill. Udhaar earns points only when it is paid on the bill; returns take points back.", { n: (form.loyaltyEarnPer ?? 100) * 20, value: formatPKR(20 * (form.loyaltyPointValue ?? 1)) })}
                  </p>
                </div>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><MessageCircle className="h-5 w-5 text-emerald-600" /> {t("WhatsApp messages")}</h2>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-sm font-medium text-slate-700">{t("Open messages in (this computer)")}</div>
                <WaModePicker />
                <p className="mt-1 text-xs text-slate-500">{t("Desktop opens the WhatsApp app installed on this PC; Web opens web.whatsapp.com.")}</p>
              </div>
              <Field label="Owner's WhatsApp number" hint="The end-of-day summary is sent here. Empty = the shop phone above.">
                <Input value={form.ownerPhone ?? ""} onChange={set("ownerPhone")} inputMode="tel" placeholder="03xx-xxxxxxx" aria-label="Owner's WhatsApp number" />
              </Field>
              <Field
                label="App address for customers (optional)"
                hint="Only if the app is on the internet (e.g. https://myshop.example.com). Then bills, repair slips and installment plans sent on WhatsApp include a link the customer can open. A link to this PC (localhost) would not open on the customer's phone."
              >
                <Input value={form.publicUrl ?? ""} onChange={set("publicUrl")} placeholder="https://" aria-label="App address for customers" />
              </Field>
              <Field label="Udhaar reminder message" hint="{name} customer · {amount} udhaar · {shop} shop name · {shopPhone} shop phone">
                <Textarea value={form.waTemplate ?? DEFAULT_WA_TEMPLATE} onChange={set("waTemplate")} className="min-h-[110px]" />
              </Field>
              <pre className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-sans text-xs text-emerald-950">
                {reminderMessage(form.waTemplate, { name: "Bilal", amount: 2500, shop: form.shopName, shopPhone: form.phone })}
              </pre>
              <Field label="Payment received message" hint="{name} · {amount} paid · {balance} still due · {receiptNo} · {date} · {method} · {shop} · {shopPhone}">
                <Textarea value={form.waPaymentTemplate || DEFAULT_WA_PAYMENT_TEMPLATE} onChange={set("waPaymentTemplate")} className="min-h-[110px]" />
              </Field>
              <pre className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-sans text-xs text-emerald-950">
                {paymentMessage(form.waPaymentTemplate, { name: "Bilal", amount: 1500, balance: 1000, receiptNo: "RCP-000012", date: new Date().toISOString(), method: "cash", shop: form.shopName, shopPhone: form.phone })}
              </pre>
            </div>
          </Card>
          <Button type="submit" size="lg" className="w-full" loading={saving} icon={<Save className="h-5 w-5" />}>Save settings</Button>
        </div>
      </form>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-5 w-5 text-brand-600" /> {t("Staff accounts")}</h2>
            {team && (
              <p className={`text-xs ${full ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                {t("{used} of {max} users used", { used: team.activeUsers, max: team.maxUsers })}{full && ` — ${t("limit reached. Ask the administrator for more users.")}`}
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
              {activeBranches.length > 1 && <Th>Branch</Th>}
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {team?.users.map((u) => (
              <tr key={u._id}>
                <Td className="font-semibold">{u.name}{u._id === me.id && <span className="ml-2 text-xs text-slate-400">{t("(you)")}</span>}</Td>
                <Td className="text-slate-500">{u.username}</Td>
                <Td>
                  <Badge color={ROLE_INFO[u.role].color}>{ROLE_INFO[u.role].label}</Badge>
                  {u.hasPin && <span className="ml-1"><Badge color="slate">PIN</Badge></span>}
                  {u.role !== "owner" && (u.maxDiscountPct !== undefined || u.allowUdhaar === false) && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {[u.maxDiscountPct !== undefined && t("discount up to {n}%", { n: u.maxDiscountPct }), u.allowUdhaar === false && t("no udhaar")].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </Td>
                {activeBranches.length > 1 && <Td className="text-slate-500">{branchName(u.branch) ?? t("All branches")}</Td>}
                <Td>{u.active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" icon={<UserCog className="h-4 w-4" />} onClick={() => setUserModal(u)}>Edit</Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {branchData && <BranchesCard data={branchData} onChanged={() => { loadBranches(); reload(); }} />}

      <DataCard />

      <UserModal
        value={userModal}
        branches={activeBranches}
        isSelf={userModal !== "new" && userModal?._id === me.id}
        onClose={() => setUserModal(null)}
        onSaved={() => { setUserModal(null); loadUsers(); }}
      />
    </div>
  );
}

function Toggle({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
      <span>
        <span className="block font-semibold text-slate-800">{t(title)}</span>
        <span className="text-sm text-slate-500">{t(text)}</span>
      </span>
    </label>
  );
}

function FbrPending({ count, onDone }: { count: number; onDone: () => void }) {
  const toast = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    try {
      const r = await api<{ tried: number; synced: number; remaining: number }>("/api/fbr/sync", { method: "POST" });
      if (r.remaining) toast.error(t("{sent} sent, {left} still waiting. Check your internet, POS ID and token.", { sent: r.synced, left: r.remaining }));
      else toast.success(t("{n} bill(s) sent to FBR", { n: r.synced }));
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`flex items-center justify-between rounded-xl p-3 text-sm ${count ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
      <span>{count ? t("{n} bill(s) waiting to be sent to FBR", { n: count }) : t("All bills have been sent to FBR")}</span>
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
  const t = useT();
  const { settings } = useSession();
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
      toast.success(t("Import done: {added} added, {updated} updated", { added: r.created, updated: r.updated }));
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
      <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-900"><Database className="h-5 w-5 text-brand-600" /> {t("Data, import & backup")}</h2>
      <p className="mb-5 text-sm text-slate-500">{t("Download your data as Excel-friendly CSV files, add many products at once, or keep a full backup.")}</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("Export to Excel (CSV)")}</h3>
          <div className="flex flex-wrap gap-2">
            {exports.map(([type, label]) => (
              <a key={type} href={`/api/export/${type}`}>
                <Button type="button" size="sm" variant="outline" icon={<Download className="h-4 w-4" />}>{label}</Button>
              </a>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("Import products from CSV")}</h3>
          <p className="mb-2 text-xs text-slate-500">{t("Existing products (same barcode or name) are updated; new ones are added.")}</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Button type="button" size="sm" loading={importing} icon={<FileUp className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <Button type="button" size="sm" variant="ghost" onClick={downloadTemplate}>Download template</Button>
          </div>
          {result && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div><b>{result.created}</b> {t("added")} · <b>{result.updated}</b> {t("updated")} · <b className={result.errorCount ? "text-rose-600" : ""}>{result.errorCount}</b> {t("skipped")}</div>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs text-rose-700">
                  {result.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("Full backup")}</h3>
          <p className="mb-2 text-xs text-slate-500">{t("One file with all products, bills, khata, purchases and expenses. Keep it safe (e.g. USB or Google Drive).")}</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/backup">
              <Button type="button" size="sm" variant="outline" icon={<Download className="h-4 w-4" />}>Download backup</Button>
            </a>
            <RestoreButton shopName={settings?.shopName ?? ""} restoreUrl="/api/restore" backupUrl="/api/backup" />
          </div>
        </div>
        <AutoBackups />
      </div>
    </Card>
  );
}

type AutoStatus = { enabled: boolean; time: string; keep: number; dir: string; lastRunAt: string | null; lastOk: boolean | null; lastError?: string; files: { name: string; size: number; at: string }[] };

/** Nightly copies on this computer, and how to keep them in Google Drive too. */
function AutoBackups() {
  const t = useT();
  const [s, setS] = useState<AutoStatus | null>(null);
  useEffect(() => {
    api<AutoStatus>("/api/backup/auto")
      .then(setS)
      .catch(() => {});
  }, []);
  if (!s) return null;
  const at = (name: string) => name.replace(".json.gz", "").replace(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/, "$1 $2:$3");
  return (
    <div className="sm:col-span-2">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("Automatic backups")}</h3>
      {!s.enabled ? (
        <p className="text-xs text-slate-500">{t("Automatic backups are switched off on this computer (AUTO_BACKUP=off).")}</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {t("Every night at {time} a copy is saved on this computer; the last {n} are kept.", { time: s.time, n: s.keep })}{" "}
            {s.lastRunAt ? (
              s.lastOk === false ? (
                <span className="font-semibold text-rose-600">{t("The last one failed: {error}", { error: s.lastError ?? "" })}</span>
              ) : (
                <span className="font-semibold text-emerald-700">{t("Last copy: {date}.", { date: formatDate(s.lastRunAt, true) })}</span>
              )
            ) : (
              t("No copy yet.")
            )}
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {t("Folder:")} <code className="rounded bg-slate-100 px-1">{s.dir}</code>
          </p>
          {s.files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {s.files.slice(0, 5).map((f) => (
                <li key={f.name}>
                  <a href={`/api/backup/auto?file=${encodeURIComponent(f.name)}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                    <Download className="h-3.5 w-3.5" /> {at(f.name)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-900">
            <b>{t("Keep a copy online (Google Drive):")}</b> {t("install")} <i>Google Drive for desktop</i> {t("on this computer, then set the backup folder (BACKUP_DIR in the app's settings file) to a folder inside Google Drive, e.g.")}{" "}
            <code className="rounded bg-white px-1">G:\My Drive\Dukaan Backups</code>{t(", and restart the app. Every nightly copy then also goes to Google Drive, so it survives a broken computer. Any copy can be restored with “Restore from backup”.")}
          </div>
        </>
      )}
    </div>
  );
}

function UserModal({
  value,
  branches,
  isSelf,
  onClose,
  onSaved,
}: {
  value: User | "new" | null;
  branches: BranchRow[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "cashier", active: true, branch: "", pin: "", removePin: false, maxDiscountPct: "", allowUdhaar: true });
  const [saving, setSaving] = useState(false);
  const isNew = value === "new";

  useEffect(() => {
    if (!value) return;
    if (value === "new") setForm({ name: "", username: "", password: "", role: "cashier", active: true, branch: "", pin: "", removePin: false, maxDiscountPct: "", allowUdhaar: true });
    else
      setForm({
        name: value.name,
        username: value.username,
        password: "",
        role: value.role,
        active: value.active,
        branch: value.branch ?? "",
        pin: "",
        removePin: false,
        maxDiscountPct: value.maxDiscountPct !== undefined ? String(value.maxDiscountPct) : "",
        allowUdhaar: value.allowUdhaar !== false,
      });
  }, [value]);
  if (!value) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const extra = {
        ...(form.pin ? { pin: form.pin } : form.removePin ? { pin: "" } : {}),
        ...(form.role !== "owner" ? { maxDiscountPct: form.maxDiscountPct === "" ? "" : Number(form.maxDiscountPct), allowUdhaar: form.allowUdhaar } : {}),
      };
      if (isNew) {
        const created = await api<{ _id: string }>("/api/users", { body: { name: form.name, username: form.username, password: form.password, role: form.role, branch: form.branch } });
        if (Object.keys(extra).length) await api(`/api/users/${created._id}`, { method: "PUT", body: extra });
      } else
        await api(`/api/users/${(value as User)._id}`, {
          method: "PUT",
          body: { name: form.name, role: form.role, active: form.active, password: form.password, ...(isSelf ? {} : { branch: form.branch }), ...extra },
        });
      toast.success(t("Saved"));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Add staff member" : t("Edit {name}", { name: form.name })} size="sm">
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
                  <span className="block font-semibold">{t(ROLE_INFO[r].label)}</span>
                  <span className="text-xs text-slate-500">{t(ROLE_INFO[r].text)}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        {branches.length > 1 && !isSelf && (
          <Field label="Branch" hint="Assigned staff only see and sell from their branch">
            <Select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
              <option value="">{t("All branches (can switch)")}</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={(value as User).hasPin ? "New PIN for switching user" : "PIN for switching user (optional)"} hint="4–6 digits. Lets this person take over a shared counter quickly with “Switch user”.">
          <Input type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, ""), removePin: false })} autoComplete="new-password" aria-label="PIN" />
        </Field>
        {!isNew && (value as User).hasPin && !form.pin && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.removePin} onChange={(e) => setForm({ ...form, removePin: e.target.checked })} className="h-4 w-4 accent-brand-600" aria-label="Remove PIN" />
            {t("Remove the PIN")}
          </label>
        )}
        {form.role !== "owner" && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-700">{t("Limits at the counter")}</div>
            <Field label="Largest discount on a bill (%)" hint="Empty = no limit. Offers and points don't count.">
              <Input type="number" min="0" max="100" step="any" value={form.maxDiscountPct} onChange={(e) => setForm({ ...form, maxDiscountPct: e.target.value })} placeholder={t("No limit")} aria-label="Discount limit" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.allowUdhaar} onChange={(e) => setForm({ ...form, allowUdhaar: e.target.checked })} className="h-4 w-4 accent-brand-600" aria-label="May give udhaar" />
              {t("May give udhaar and installments")}
            </label>
          </div>
        )}
        {!isNew && !isSelf && (
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 accent-brand-600" />
            <span className="font-medium">{t("Account active (can log in)")}</span>
          </label>
        )}
        <Button type="submit" size="lg" className="w-full" loading={saving}>Save</Button>
      </form>
    </Modal>
  );
}

function BranchesCard({ data, onChanged }: { data: BranchData; onChanged: () => void }) {
  const toast = useToast();
  const t = useT();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<BranchRow | "new" | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const full = data.activeBranches >= data.maxBranches;

  useEffect(() => {
    if (!editing) return;
    setForm(editing === "new" ? { name: "", address: "", phone: "" } : { name: editing.name, address: editing.address ?? "", phone: editing.phone ?? "" });
  }, [editing]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing === "new") await api("/api/branches", { body: form });
      else if (editing) await api(`/api/branches/${editing._id}`, { method: "PUT", body: form });
      toast.success(t("Branch saved"));
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(b: BranchRow, active: boolean) {
    if (
      !active &&
      !(await confirm({
        title: t("Close {name}?", { name: b.name }),
        message: t("Staff can no longer choose this branch. You can re-open it later."),
        tone: "danger",
        points: [t("The branch must have no stock left (transfer it first) and no staff assigned."), t("Its old bills stay in Sales History and Reports.")],
        confirmLabel: "Close branch",
      }))
    )
      return;
    try {
      await api(`/api/branches/${b._id}`, { method: "PUT", body: { active } });
      toast.success(active ? t("Branch re-opened") : t("Branch closed"));
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><MapPin className="h-5 w-5 text-brand-600" /> {t("Branches")}</h2>
          <p className={`text-xs ${full ? "font-semibold text-amber-700" : "text-slate-500"}`}>
            {t(data.maxBranches === 1 ? "{used} of {max} branch used" : "{used} of {max} branches used", { used: data.activeBranches, max: data.maxBranches })}
            {full && data.maxBranches === 1 && ` — ${t("ask the administrator if you open another branch.")}`}
          </p>
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={full} onClick={() => setEditing("new")}>Add branch</Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Branch</Th>
            <Th>Address</Th>
            <Th>Assigned staff</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {data.branches.map((b) => (
            <tr key={b._id}>
              <Td className="font-semibold">
                {b.name} {b.isMain && <Badge color="violet">Main</Badge>}
              </Td>
              <Td className="text-slate-500">{[b.address, b.phone].filter(Boolean).join(" · ") || "—"}</Td>
              <Td className="text-slate-500">{b.staff}</Td>
              <Td>{b.active ? <Badge color="green">Open</Badge> : <Badge color="slate">Closed</Badge>}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(b)}>Edit</Button>
                  {!b.isMain &&
                    (b.active ? (
                      <Button size="sm" variant="ghost" className="hover:text-rose-600" onClick={() => setActive(b, false)}>Close</Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={full} onClick={() => setActive(b, true)}>Re-open</Button>
                    ))}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add branch" : "Edit branch"} size="sm">
        <form onSubmit={save} className="space-y-4">
          <Field label="Branch name *"><Input required minLength={2} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("e.g. Gulberg Branch")} /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={saving}>Save branch</Button>
        </form>
      </Modal>
    </Card>
  );
}


/** Printer settings are kept per computer: each counter can have its own printer and paper. */
function PrintingCard() {
  const t = useT();
  const [prefs, setPrefs] = useState<PrintPrefs | null>(null);
  useEffect(() => setPrefs(getPrintPrefs()), []);
  if (!prefs) return null;
  const update = (p: Partial<PrintPrefs>) => {
    setPrintPrefs(p);
    setPrefs({ ...prefs, ...p });
  };
  return (
    <Card className="p-6">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-900"><Printer className="h-5 w-5 text-slate-600" /> {t("Printing (this computer)")}</h2>
      <p className="mb-4 text-xs text-slate-500">{t("Saved on this computer only — set it on every counter.")}</p>
      <div className="space-y-3">
        <Toggle checked={prefs.auto} onChange={(v) => update({ auto: v })} title="Print the receipt automatically" text="After every bill, without clicking Print. Use Chrome with silent printing (see README) so no print window appears." />
        <Toggle checked={prefs.udhaarCopy} onChange={(v) => update({ udhaarCopy: v })} title="Shop copy for udhaar bills" text="Prints a second copy marked “SHOP COPY” when part of the bill goes to udhaar — ask the customer to sign it." />
        <Field label="Receipt paper">
          <Select value={prefs.paper} onChange={(e) => update({ paper: e.target.value as "80" | "58" })} aria-label="Receipt paper">
            <option value="80">{t("80 mm (3 inch) — most thermal printers")}</option>
            <option value="58">{t("58 mm (2 inch) — small printers")}</option>
          </Select>
        </Field>
        <Button type="button" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => printInFrame("/receipt/test?print=1")}>
          Print a test receipt
        </Button>
        <p className="text-xs text-slate-500">{t("Cash drawer: in the printer's Windows settings turn on “open cash drawer before printing” — the drawer then opens with every receipt.")}</p>
      </div>
    </Card>
  );
}
