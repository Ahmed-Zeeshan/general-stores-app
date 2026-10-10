"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, DatabaseBackup, Download, Plus, Search, Store, TrendingUp, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { SHOP_TYPES, shopState, type ShopRow } from "@/components/admin";

export default function AdminShopsPage() {
  const toast = useToast();
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<ShopRow[]>("/api/admin/tenants").then(setShops).catch((e) => toast.error(e.message));
  }, [toast]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (shops ?? []).filter((s) => !t || s.shopName.toLowerCase().includes(t) || s.ownerName?.toLowerCase().includes(t) || s.phone?.includes(t));
  }, [shops, q]);

  const active = shops?.filter((s) => shopState(s).label === "Active").length ?? 0;
  const seats = shops?.reduce((a, s) => a + s.activeUsers, 0) ?? 0;
  const sales = shops?.reduce((a, s) => a + s.sales30, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Shops"
        urdu="دکانیں"
        subtitle="Create shops, set how many users each shop can have, and suspend shops"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New shop
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total shops" value={shops?.length ?? "—"} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Active shops" value={active} icon={<Store className="h-5 w-5" />} tone="blue" />
        <StatCard label="Active users" value={seats} icon={<Users className="h-5 w-5" />} tone="violet" />
        <StatCard label="Sales, all shops (30 days)" value={formatPKR(sales)} icon={<TrendingUp className="h-5 w-5" />} tone="amber" />
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shop, owner or phone" className="pl-10" />
          </div>
        </div>
        {!shops ? (
          <Spinner />
        ) : shops.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title="No shops yet"
            text="Create the first shop and its owner account. The owner can then log in and add their staff."
            action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Create first shop</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Shop</Th>
                <Th>Status</Th>
                <Th>Users</Th>
                <Th>Branches</Th>
                <Th className="text-right">Products</Th>
                <Th className="text-right">Sales (30d)</Th>
                <Th>Last sale</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const st = shopState(s);
                return (
                  <tr key={s._id} className="hover:bg-slate-50/60">
                    <Td>
                      <Link href={`/admin/shops/${s._id}`} className="block">
                        <div className="font-semibold text-slate-800">{s.shopName}</div>
                        <div className="text-xs text-slate-400">
                          {SHOP_TYPES[s.shopType]} · {s.ownerName}
                          {s.phone && ` · ${s.phone}`}
                        </div>
                      </Link>
                    </Td>
                    <Td>
                      <Badge color={st.color}>{st.label}</Badge>
                      {s.expiresAt && st.label === "Active" && <div className="mt-1 text-xs text-slate-400">until {formatDate(s.expiresAt)}</div>}
                    </Td>
                    <Td>
                      <span className={s.activeUsers >= s.maxUsers ? "font-semibold text-amber-700" : "text-slate-700"}>
                        {s.activeUsers} / {s.maxUsers}
                      </span>
                    </Td>
                    <Td className="text-slate-700">{s.branches} / {s.maxBranches}</Td>
                    <Td className="text-right text-slate-600">{s.products}</Td>
                    <Td className="text-right font-semibold">{formatPKR(s.sales30)}</Td>
                    <Td className="text-slate-500">{s.lastSaleAt ? formatDate(s.lastSaleAt) : "—"}</Td>
                    <Td className="text-right">
                      <Link href={`/admin/shops/${s._id}`}>
                        <Button size="sm" variant="ghost">
                          Manage <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <Td colSpan={8} className="py-10 text-center text-slate-500">No shops match your search.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card>

      <AutoBackupsCard />

      <CreateShopModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          load();
        }}
      />
    </div>
  );
}

function CreateShopModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const empty = { shopName: "", shopType: "karyana", phone: "", address: "", maxUsers: "3", maxBranches: "1", plan: "Standard", expiresAt: "", ownerName: "", username: "", password: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admin/tenants", { body: { ...form, maxUsers: Number(form.maxUsers), maxBranches: Number(form.maxBranches), expiresAt: form.expiresAt || null } });
      toast.success(`${form.shopName} created. Owner can log in as "${form.username}".`);
      onCreated();
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
      title="New shop"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="shop-form" loading={saving}>Create shop</Button>
        </>
      }
    >
      <form id="shop-form" onSubmit={save} className="space-y-6">
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Shop</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shop name *" className="sm:col-span-2">
              <Input autoFocus required minLength={2} value={form.shopName} onChange={set("shopName")} placeholder="e.g. Madina General Store" />
            </Field>
            <Field label="Shop type" hint="Ready-made categories are added for this type">
              <Select value={form.shopType} onChange={set("shopType")}>
                {Object.entries(SHOP_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="03xx xxxxxxx" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={form.address} onChange={set("address")} />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Plan & limits</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Max users *" hint="Including the owner">
              <Input required type="number" min={1} max={1000} value={form.maxUsers} onChange={set("maxUsers")} />
            </Field>
            <Field label="Max branches *">
              <Input required type="number" min={1} max={200} value={form.maxBranches} onChange={set("maxBranches")} />
            </Field>
            <Field label="Plan name">
              <Input value={form.plan} onChange={set("plan")} />
            </Field>
            <Field label="Access until" hint="Empty = no end date">
              <Input type="date" value={form.expiresAt} onChange={set("expiresAt")} />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Owner login</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Owner name *">
              <Input required minLength={2} value={form.ownerName} onChange={set("ownerName")} />
            </Field>
            <Field label="Username *" hint="No spaces">
              <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} autoComplete="off" />
            </Field>
            <Field label="Password *" hint="At least 6 characters">
              <Input required minLength={6} type="text" value={form.password} onChange={set("password")} autoComplete="new-password" />
            </Field>
          </div>
        </section>
      </form>
    </Modal>
  );
}

type BackupInfo = {
  dir: string;
  enabled: boolean;
  time: string;
  keep: number;
  status: { lastRunAt?: string; lastOk?: boolean; lastError?: string; shops?: number };
  shops: { folder: string; tenantId: string; shopName: string; files: { name: string; size: number; at: string }[] }[];
};

/** Nightly copies of every shop saved on this computer. */
function AutoBackupsCard() {
  const toast = useToast();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [running, setRunning] = useState(false);
  const load = useCallback(() => {
    api<BackupInfo>("/api/admin/backups").then(setInfo).catch((e) => toast.error(e.message));
  }, [toast]);
  useEffect(load, [load]);
  async function runNow() {
    setRunning(true);
    try {
      const r = await api<{ lastOk: boolean; shops: number; lastError?: string }>("/api/admin/backups", { method: "POST" });
      if (r.lastOk) toast.success(`Backed up ${r.shops} shop(s)`);
      else toast.error(r.lastError ?? "Backup failed");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }
  const st = info?.status;
  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><DatabaseBackup className="h-5 w-5 text-brand-600" /> Automatic backups</h2>
          {info && (
            <p className="text-xs text-slate-500">
              {info.enabled ? `Every night at ${info.time}, newest ${info.keep} kept per shop` : "Switched off (AUTO_BACKUP=off)"} · folder: <code className="break-all">{info.dir}</code>
            </p>
          )}
        </div>
        <Button variant="outline" loading={running} icon={<DatabaseBackup className="h-4 w-4" />} onClick={runNow}>Back up now</Button>
      </div>
      {!info ? (
        <Spinner />
      ) : (
        <div className="p-4">
          <p className={`mb-3 text-sm ${st?.lastRunAt ? (st.lastOk ? "text-emerald-700" : "text-rose-600") : "text-amber-700"}`}>
            {st?.lastRunAt ? `Last backup ${formatDate(st.lastRunAt, true)} — ${st.lastOk ? `${st.shops} shop(s) saved` : `failed: ${st.lastError}`}` : "No automatic backup yet. It runs within a few minutes of starting the server, then every night."}
          </p>
          {info.shops.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {info.shops.map((s) => (
                <li key={s.folder} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{s.shopName}</span>
                  <span className="text-slate-400">· {s.files.length} copies</span>
                  {s.files[0] && (
                    <a className="ml-auto" href={`/api/admin/backups/file?folder=${encodeURIComponent(s.folder)}&name=${encodeURIComponent(s.files[0].name)}`}>
                      <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}>Latest ({s.files[0].at.replace("_", " ")})</Button>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Copy this folder to a USB drive or cloud storage every week — a backup on the same disk does not survive a broken disk. A downloaded .json.gz can be restored from the shop&apos;s page as it is.</p>
        </div>
      )}
    </Card>
  );
}
