"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { LangSwitch, useT } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { cache, clearOfflineCache } from "@/lib/offline";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  // Nobody is logged in here (logged out, or the login ran out): the shop data saved on this device for
  // offline use goes. Offline bills not sent yet and held bills stay until someone logs in again.
  useEffect(() => clearOfflineCache(), []);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/setup")
      .then((r) => r.needsSetup && router.replace("/setup"))
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api<{ role: string; me?: unknown }>("/api/auth/login", { body: { username, password } });
      // The app draws its menu from this at once instead of asking the server again.
      if (r.me) cache.set("me", r.me);
      router.replace(r.role === "superadmin" ? "/admin" : "/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-10 lg:hidden">
        <Logo />
      </div>
      <div className="mb-6 flex justify-end">
        <LangSwitch />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("Welcome back")}</h1>
      <p className="mt-2 text-slate-500">{t("Log in to open your shop.")} <span className="urdu">خوش آمدید</span></p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label={t("Username")}>
          <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. ahmed" required />
        </Field>
        <Field label={t("Password")}>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Your password")}
              required
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} icon={<LogIn className="h-5 w-5" />}>
          {t("Log in")}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-500">{t("Forgot your password? Staff: ask your shop owner. Shop owners: ask the administrator.")}</p>
    </div>
  );
}
