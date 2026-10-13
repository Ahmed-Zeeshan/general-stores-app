"use client";

import { useEffect, useState } from "react";
import { Delete, UserRound, Users } from "lucide-react";
import { Button, Modal, Spinner, cn } from "./ui";
import { useT } from "@/lib/i18n";

type Person = { _id: string; name: string; role: string; current: boolean };

/** "Switch user" on a shared counter: tap your name, type your PIN — no logging out and in. */
export function SwitchUserButton({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline", className)}>
        <Users className="h-3.5 w-3.5" /> {t("Switch user")}
      </button>
      {open && <SwitchUserModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SwitchUserModal({ onClose }: { onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [who, setWho] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/auth/switch")
      .then((r) => r.json())
      .then((list) => setPeople(Array.isArray(list) ? list : []))
      .catch(() => setPeople([]));
  }, []);
  async function go(p: string) {
    if (!who) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: who._id, pin: p }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not switch.");
      // Fresh start for the new person (menu, permissions, branch).
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      setBusy(false);
    }
  }
  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };
  useEffect(() => {
    if (!who) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter" && pin.length >= 4) go(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Modal open onClose={onClose} title={who ? `PIN for ${who.name}` : "Who is at the counter?"} size="sm">
      {!people ? (
        <Spinner />
      ) : !who ? (
        people.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Nobody has a PIN yet. The owner can give each person a PIN in Settings → Staff accounts.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {people.map((p) => (
              <button
                key={p._id}
                type="button"
                disabled={p.current}
                onClick={() => setWho(p)}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 p-4 font-semibold text-slate-800 hover:border-brand-400 disabled:opacity-50"
                aria-label={`Switch to ${p.name}`}
              >
                <UserRound className="h-8 w-8 text-slate-400" />
                {p.name}
                <span className="text-xs font-normal capitalize text-slate-500">{p.current ? "logged in now" : p.role}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div>
          <div className="mb-4 flex justify-center gap-3" aria-label="PIN entered">
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span key={i} className={cn("h-4 w-4 rounded-full border-2", i < pin.length ? "border-brand-600 bg-brand-600" : "border-slate-300")} />
            ))}
          </div>
          {error && <p className="mb-3 text-center text-sm font-medium text-rose-600">{error}</p>}
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} className="h-14 rounded-xl bg-slate-100 text-2xl font-bold text-slate-800 hover:bg-slate-200" aria-label={`Digit ${d}`}>
                {d}
              </button>
            ))}
            <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-14 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Delete digit">
              <Delete className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => press("0")} className="h-14 rounded-xl bg-slate-100 text-2xl font-bold text-slate-800 hover:bg-slate-200" aria-label="Digit 0">
              0
            </button>
            <Button className="h-14" loading={busy} disabled={pin.length < 4} onClick={() => go(pin)}>
              OK
            </Button>
          </div>
          <button type="button" onClick={() => {
              setWho(null);
              setPin("");
              setError("");
            }} className="mt-4 w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-700">
            ← Someone else
          </button>
        </div>
      )}
    </Modal>
  );
}
