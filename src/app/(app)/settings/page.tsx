"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Save, ShieldCheck, Store, UserCog, Users } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Textarea } from "@/components/ui";
import { useSession, type ShopSettings } from "@/components/session";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

type User = { _id: string; name: string; username: string; role: "owner" | "manager" | "cashier"; active: boolean };

const ROLE_INFO = {
  owner: { label: "Owner", color: "violet" as const, text: "Full access, including settings and users" },
  manager: { label: "Manager", color: "blue" as const, text: "Products, purchases, expenses, reports, returns" },
  cashier: { label: "Cashier", color: "slate" as const, text: "Make bills and receive udhaar payments only" },
};

export default function SettingsPage() {
  const toast = useToast();
  const { user: me, reload } = useSession();
  const [form, setForm] = useState<ShopSettings & { ownerName?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [userModal, setUserModal] = useState<User | "new" | null>(null);

  const loadUsers = useCallback(() => {
    api<User[]>("/api/users").then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    api<ShopSettings>("/api/settings").then(setForm).catch((e) => toast.error(e.message));
    loadUsers();
  }, [loadUsers, toast]);

  if (!form) return <Spinner />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", body: form });
      toast.success("Settings saved");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" urdu="ترتیبات" subtitle="Shop details, tax and staff accounts" />
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
            <Field label="Phone"><Input value={form.phone ?? ""} onChange={set("phone")} /></Field>
            <Field label="Address"><Input value={form.address ?? ""} onChange={set("address")} /></Field>
            <Field label="Message at bottom of receipt"><Textarea value={form.receiptFooter ?? ""} onChange={set("receiptFooter")} className="min-h-[60px]" /></Field>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-brand-600" /> Tax (FBR)</h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NTN"><Input value={form.ntn ?? ""} onChange={set("ntn")} placeholder="Optional" /></Field>
              <Field label="STRN"><Input value={form.strn ?? ""} onChange={set("strn")} placeholder="Optional" /></Field>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
              <input type="checkbox" checked={form.taxEnabled} onChange={(e) => setForm({ ...form, taxEnabled: e.target.checked })} className="mt-0.5 h-5 w-5 accent-brand-600" />
              <span>
                <span className="block font-semibold text-slate-800">Charge sales tax on bills</span>
                <span className="text-sm text-slate-500">Turn on if you are registered with FBR for sales tax.</span>
              </span>
            </label>
            {form.taxEnabled && (
              <>
                <Field label="Sales tax rate (%)"><Input type="number" min="0" max="100" step="any" value={form.taxRate} onChange={set("taxRate")} /></Field>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
                  <input type="checkbox" checked={form.pricesIncludeTax} onChange={(e) => setForm({ ...form, pricesIncludeTax: e.target.checked })} className="mt-0.5 h-5 w-5 accent-brand-600" />
                  <span>
                    <span className="block font-semibold text-slate-800">My prices already include tax</span>
                    <span className="text-sm text-slate-500">If off, tax is added on top of the price at billing.</span>
                  </span>
                </label>
              </>
            )}
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full" loading={saving} icon={<Save className="h-5 w-5" />}>Save settings</Button>
        </Card>
      </form>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-5 w-5 text-brand-600" /> Staff accounts</h2>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setUserModal("new")}>Add staff</Button>
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
            {users.map((u) => (
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

      <UserModal value={userModal} isSelf={userModal !== "new" && userModal?._id === me.id} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); loadUsers(); }} />
    </div>
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
