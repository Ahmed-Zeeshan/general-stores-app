"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, CheckCircle2, Download, Plus, Save, UserCog, Users } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Table, Td, Th, Textarea } from "@/components/ui";
import { SHOP_TYPES, shopState } from "@/components/admin";
import { RestoreButton } from "@/components/restore";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/client";

type Tenant = {
  _id: string;
  shopName: string;
  shopType: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  status: "active" | "suspended";
  maxUsers: number;
  maxBranches?: number;
  plan?: string;
  expiresAt?: string;
  adminNotes?: string;
  createdAt: string;
};
type ShopBranch = { _id: string; name: string; isMain: boolean; active: boolean };
type ShopUser = { _id: string; name: string; username: string; role: "owner" | "manager" | "cashier"; active: boolean; lastLoginAt?: string };

const ROLE_COLOR = { owner: "violet", manager: "blue", cashier: "slate" } as const;

export default function AdminShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [data, setData] = useState<{ tenant: Tenant; users: ShopUser[]; branches: ShopBranch[] } | null>(null);
  const [form, setForm] = useState({ shopName: "", maxUsers: "", maxBranches: "", plan: "", expiresAt: "", adminNotes: "" });
  const [saving, setSaving] = useState(false);
  const [userModal, setUserModal] = useState<ShopUser | "new" | null>(null);

  const load = useCallback(() => {
    api<{ tenant: Tenant; users: ShopUser[]; branches: ShopBranch[] }>(`/api/admin/tenants/${id}`)
      .then((d) => {
        setData(d);
        setForm({
          shopName: d.tenant.shopName,
          maxUsers: String(d.tenant.maxUsers),
          maxBranches: String(d.tenant.maxBranches ?? 1),
          plan: d.tenant.plan ?? "",
          expiresAt: d.tenant.expiresAt ? d.tenant.expiresAt.slice(0, 10) : "",
          adminNotes: d.tenant.adminNotes ?? "",
        });
      })
      .catch((e) => toast.error(e.message));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const { tenant, users } = data;
  const st = shopState(tenant);
  const activeUsers = users.filter((u) => u.active).length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/admin/tenants/${id}`, {
        method: "PUT",
        body: { ...form, maxUsers: Number(form.maxUsers), maxBranches: Number(form.maxBranches), expiresAt: form.expiresAt || null },
      });
      toast.success("Shop updated");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: "active" | "suspended") {
    if (status === "suspended" && !confirm(`Suspend ${tenant.shopName}? All its users will be logged out and cannot use the shop until you activate it again. No data is deleted.`)) return;
    try {
      await api(`/api/admin/tenants/${id}`, { method: "PUT", body: { status, expiresAt: form.expiresAt || null } });
      toast.success(status === "active" ? "Shop activated" : "Shop suspended");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All shops
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{tenant.shopName}</h1>
            <Badge color={st.color}>{st.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {SHOP_TYPES[tenant.shopType]} · Owner {tenant.ownerName} {tenant.phone && `· ${tenant.phone}`} · Since {formatDate(tenant.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/admin/tenants/${id}/backup`}>
            <Button variant="outline" icon={<Download className="h-4 w-4" />}>Backup</Button>
          </a>
          <RestoreButton shopName={tenant.shopName} restoreUrl={`/api/admin/tenants/${id}/restore`} backupUrl={`/api/admin/tenants/${id}/backup`} onDone={load} />
          {tenant.status === "active" ? (
            <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setStatus("suspended")}>Suspend shop</Button>
          ) : (
            <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setStatus("active")}>Activate shop</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h2 className="mb-5 font-bold text-slate-900">Plan & limits</h2>
          <form onSubmit={save} className="space-y-4">
            <Field label="Shop name">
              <Input required minLength={2} value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} />
            </Field>
            <Field
              label="Maximum users"
              hint={`${activeUsers} active now. The owner cannot add or enable users beyond this.`}
              error={Number(form.maxUsers) < activeUsers ? `Lower than the ${activeUsers} active users. Existing users keep working, but no new ones can be added.` : undefined}
            >
              <Input required type="number" min={1} max={1000} value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} />
            </Field>
            <Field
              label="Maximum branches"
              hint={`${data.branches.filter((b) => b.active).length} open: ${data.branches.filter((b) => b.active).map((b) => b.name).join(", ") || "Main Branch"}`}
            >
              <Input required type="number" min={1} max={200} value={form.maxBranches} onChange={(e) => setForm({ ...form, maxBranches: e.target.value })} />
            </Field>
            <Field label="Plan name">
              <Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
            </Field>
            <Field label="Access until" hint="Empty = no end date. After this date the shop cannot log in.">
              <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </Field>
            <Field label="Private notes" hint="Only visible to admins">
              <Textarea value={form.adminNotes} onChange={(e) => setForm({ ...form, adminNotes: e.target.value })} className="min-h-[70px]" />
            </Field>
            <Button type="submit" className="w-full" loading={saving} icon={<Save className="h-4 w-4" />}>Save changes</Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-5 w-5 text-brand-600" /> Users</h2>
              <p className="text-xs text-slate-500">{activeUsers} of {tenant.maxUsers} seats used</p>
            </div>
            <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={activeUsers >= tenant.maxUsers} onClick={() => setUserModal("new")}>
              Add user
            </Button>
          </div>
          <div className="px-6 pt-4">
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full ${activeUsers >= tenant.maxUsers ? "bg-amber-500" : "bg-brand-500"}`}
                style={{ width: `${Math.min(100, (activeUsers / Math.max(1, tenant.maxUsers)) * 100)}%` }}
              />
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Username</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <Td className="font-semibold">{u.name}</Td>
                  <Td className="text-slate-500">{u.username}</Td>
                  <Td><Badge color={ROLE_COLOR[u.role]}>{u.role[0].toUpperCase() + u.role.slice(1)}</Badge></Td>
                  <Td>{u.active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}</Td>
                  <Td className="text-slate-500">{u.lastLoginAt ? formatDate(u.lastLoginAt, true) : "Never"}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" icon={<UserCog className="h-4 w-4" />} onClick={() => setUserModal(u)}>Edit</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <AdminUserModal shopId={id} value={userModal} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); load(); }} />
    </div>
  );
}

function AdminUserModal({ shopId, value, onClose, onSaved }: { shopId: string; value: ShopUser | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "cashier", active: true });
  const [saving, setSaving] = useState(false);
  const isNew = value === "new";
  useEffect(() => {
    if (!value) return;
    if (value === "new") setForm({ name: "", username: "", password: "", role: "owner", active: true });
    else setForm({ name: value.name, username: value.username, password: "", role: value.role, active: value.active });
  }, [value]);
  if (!value) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) await api(`/api/admin/tenants/${shopId}/users`, { body: form });
      else await api(`/api/admin/users/${(value as ShopUser)._id}`, { method: "PUT", body: { name: form.name, role: form.role, active: form.active, password: form.password } });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Add user to shop" : `Edit ${form.name}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Username">
          <Input required disabled={!isNew} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} autoComplete="off" />
        </Field>
        <Field label={isNew ? "Password" : "Reset password"} hint={isNew ? "At least 6 characters" : "Leave empty to keep the current password"}>
          <Input type="text" required={isNew} minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
          </Select>
        </Field>
        {!isNew && (
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
