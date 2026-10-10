"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/logo";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

export default function SetupPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/setup")
      .then((r) => !r.needsSetup && router.replace("/login"))
      .catch(() => {});
  }, [router]);

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error("Both passwords must match.");
    setLoading(true);
    try {
      await api("/api/setup", { body: { name: form.name, username: form.username, password: form.password } });
      toast.success("Admin account created. Now add your first shop.");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Create the admin account</h1>
      <p className="mt-2 text-slate-500">
        This is the <b>super admin</b> who creates shops, decides how many users each shop can have, and can suspend a shop. Shop owners get their own logins.
      </p>
      <form onSubmit={finish} className="mt-8 space-y-4">
        <Field label="Your name *">
          <Input autoFocus required minLength={2} value={form.name} onChange={set("name")} placeholder="e.g. Asif Ahmed" />
        </Field>
        <Field label="Username *" hint="Small letters or numbers, no spaces. e.g. admin">
          <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} autoComplete="username" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password *" hint="At least 8 characters">
            <Input type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" />
          </Field>
          <Field label="Repeat password *">
            <Input type="password" required minLength={8} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading} icon={<Check className="h-5 w-5" />}>
          Create admin account
        </Button>
      </form>
    </div>
  );
}
