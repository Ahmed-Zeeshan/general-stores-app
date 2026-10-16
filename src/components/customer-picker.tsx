"use client";

import { useEffect, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { Button, Field, Input, Modal } from "./ui";
import { useToast } from "./toast";
import { api, NetworkError } from "@/lib/client";
import { cache } from "@/lib/offline";
import { useSession } from "./session";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";
import { checkPartyPhone } from "@/lib/phone";

export type PartyLite = { _id: string; name: string; phone?: string; balance: number; creditLimit: number; priceLevel?: "retail" | "wholesale"; points?: number };

export function CustomerPicker({
  open,
  onClose,
  onPick,
  type = "customer",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: PartyLite) => void;
  type?: "customer" | "supplier";
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [list, setList] = useState<PartyLite[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const tr = useT();
  const label = type === "customer" ? "customer" : "supplier";
  const { user } = useSession();
  const cacheKey = `${user.tenantId}:parties:${type}`;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<PartyLite[]>(`/api/parties?type=${type}&q=${encodeURIComponent(q)}`)
        .then((r) => {
          setList(r);
          if (!q) cache.set(cacheKey, r);
        })
        .catch((err) => {
          // Offline: search the list saved on this device.
          if (!(err instanceof NetworkError)) return;
          const t = q.trim().toLowerCase();
          const saved = cache.get<PartyLite[]>(cacheKey, []);
          setList(saved.filter((p) => !t || p.name.toLowerCase().includes(t) || p.phone?.includes(t)));
        });
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, type, cacheKey]);

  useEffect(() => {
    if (open) {
      setQ("");
      setAdding(false);
      setForm({ name: "", phone: "" });
      setPhoneError("");
    }
  }, [open]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const phone = checkPartyPhone(type, form.phone);
    if (phone.error) return setPhoneError(phone.error);
    setSaving(true);
    try {
      const p = await api<PartyLite>("/api/parties", { body: { type, name: form.name, phone: phone.phone ?? "" } });
      toast.success(`${p.name} added`);
      onPick(p);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={adding ? `New ${label}` : `Choose ${label}`}>
      {adding ? (
        <form onSubmit={add} className="space-y-4">
          <Field label="Name *">
            <Input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Phone" error={phoneError ? tr(phoneError) : undefined}>
            <Input
              inputMode="tel"
              value={form.phone}
              onChange={(e) => {
                setForm({ ...form, phone: e.target.value });
                setPhoneError("");
              }}
              placeholder="0300-1234567"
              aria-invalid={!!phoneError}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>Back</Button>
            <Button type="submit" loading={saving}>Save & select</Button>
          </div>
        </form>
      ) : (
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className="pl-10" />
          </div>
          <Button variant="secondary" className="mb-3 w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add new {label}
          </Button>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {list.map((p) => (
              <li key={p._id}>
                <button onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-slate-50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.phone || "No phone"}</div>
                  </div>
                  {p.balance > 0 && <span className="text-sm font-semibold text-amber-700">{formatPKR(p.balance)}</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="py-8 text-center text-sm text-slate-500">No {label}s found.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
