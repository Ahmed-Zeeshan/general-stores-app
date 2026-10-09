"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/logo";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/setup")
      .then((r) => r.needsSetup && router.replace("/setup"))
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/login", { body: { username, password } });
      router.replace("/");
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
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-2 text-slate-500">Log in to open your shop. <span className="urdu">خوش آمدید</span></p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Username">
          <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. ahmed" required />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
          Log in
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-500">Forgot your password? Ask the shop owner to reset it from Settings.</p>
    </div>
  );
}
