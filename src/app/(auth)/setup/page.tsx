"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Cake, Check, ShoppingBasket, Store, Warehouse } from "lucide-react";
import { Button, Field, Input, cn } from "@/components/ui";
import { Logo } from "@/components/logo";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

const SHOP_TYPES = [
  { value: "karyana", label: "Karyana Store", urdu: "کریانہ", icon: ShoppingBasket },
  { value: "general", label: "General Store", urdu: "جنرل اسٹور", icon: Store },
  { value: "bakery", label: "Bakery", urdu: "بیکری", icon: Cake },
  { value: "other", label: "Other Shop", urdu: "دیگر", icon: Warehouse },
] as const;

export default function SetupPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    shopType: "karyana",
    shopName: "",
    phone: "",
    address: "",
    ownerName: "",
    username: "",
    password: "",
    confirm: "",
  });
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
      const { confirm: _c, ...body } = form;
      void _c;
      await api("/api/setup", { body });
      toast.success("Your shop is ready!");
      router.replace("/");
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
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={cn("h-1.5 flex-1 rounded-full transition", s <= step ? "bg-brand-600" : "bg-slate-200")} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <p className="text-sm font-semibold text-brand-600">Step 1 of 3</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">What kind of shop do you have?</h1>
          <p className="mt-2 text-slate-500">We will add ready-made categories for you. You can change them later.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {SHOP_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, shopType: t.value })}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition",
                  form.shopType === t.value ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                {form.shopType === t.value && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <t.icon className={cn("h-8 w-8", form.shopType === t.value ? "text-brand-600" : "text-slate-400")} />
                <span className="font-semibold text-slate-900">{t.label}</span>
                <span className="urdu text-sm text-slate-500">{t.urdu}</span>
              </button>
            ))}
          </div>
          <Button size="lg" className="mt-8 w-full" onClick={() => setStep(2)}>
            Continue <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep(3);
          }}
        >
          <p className="text-sm font-semibold text-brand-600">Step 2 of 3</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Tell us about your shop</h1>
          <p className="mt-2 text-slate-500">This will be printed on your bills.</p>
          <div className="mt-8 space-y-4">
            <Field label="Shop name *">
              <Input autoFocus required minLength={2} value={form.shopName} onChange={set("shopName")} placeholder="e.g. Madina General Store" />
            </Field>
            <Field label="Phone number">
              <Input value={form.phone} onChange={set("phone")} placeholder="e.g. 0300 1234567" inputMode="tel" />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={set("address")} placeholder="e.g. Main Bazar, Lahore" />
            </Field>
          </div>
          <div className="mt-8 flex gap-3">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Button type="submit" size="lg" className="flex-1">
              Continue <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={finish}>
          <p className="text-sm font-semibold text-brand-600">Step 3 of 3</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Create your owner account</h1>
          <p className="mt-2 text-slate-500">You will use this to log in. Keep your password safe.</p>
          <div className="mt-8 space-y-4">
            <Field label="Your name *">
              <Input autoFocus required minLength={2} value={form.ownerName} onChange={set("ownerName")} placeholder="e.g. Ahmed Ali" />
            </Field>
            <Field label="Username *" hint="Small letters or numbers, no spaces. e.g. ahmed">
              <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} autoComplete="username" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password *" hint="At least 6 characters">
                <Input type="password" required minLength={6} value={form.password} onChange={set("password")} autoComplete="new-password" />
              </Field>
              <Field label="Repeat password *">
                <Input type="password" required minLength={6} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
              </Field>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Button type="submit" size="lg" className="flex-1" loading={loading} icon={<Check className="h-5 w-5" />}>
              Open my shop
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
