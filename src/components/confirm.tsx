"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, Info, Trash2, X } from "lucide-react";
import { Button, cn } from "./ui";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  /** Label/value rows shown in a summary box, e.g. bill number and refund amount. */
  details?: { label: string; value: React.ReactNode; strong?: boolean }[];
  /** Bullet points: what will happen. */
  points?: React.ReactNode[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red button (delete, return, suspend); warning = amber; info = normal. */
  tone?: "danger" | "warning" | "info";
  icon?: "delete" | "warning" | "question" | "info";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * In-app confirmation window (replaces the browser's "localhost says…" pop-up).
 * Usage: const confirm = useConfirm(); if (!(await confirm({ title: "Delete?", tone: "danger" }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...o, resolve });
      }),
    [],
  );
  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog options={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}

const TONES = {
  danger: { ring: "bg-rose-100 text-rose-600", button: "danger" as const },
  warning: { ring: "bg-amber-100 text-amber-600", button: "primary" as const },
  info: { ring: "bg-brand-100 text-brand-700", button: "primary" as const },
};
const ICONS = { delete: Trash2, warning: AlertTriangle, question: HelpCircle, info: Info };

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const tone = options.tone ?? "info";
  const Icon = ICONS[options.icon ?? (tone === "danger" ? "warning" : tone === "warning" ? "warning" : "question")];
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // For risky actions the safe button has focus, so pressing Enter by mistake does nothing harmful.
    (tone === "danger" ? cancelRef : okRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tone, onClose]);

  return (
    <div className="no-print fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => onClose(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <button
          onClick={() => onClose(false)}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="px-6 pb-5 pt-6">
          <div className="flex gap-4">
            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", TONES[tone].ring)}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
                {options.title}
              </h2>
              {options.message && <div className="mt-1 text-sm text-slate-600">{options.message}</div>}
            </div>
          </div>
          {options.details && options.details.length > 0 && (
            <dl className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50/70 px-4">
              {options.details.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-slate-500">{d.label}</dt>
                  <dd className={cn("text-right", d.strong ? "text-base font-bold text-slate-900" : "font-semibold text-slate-800")}>{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {options.points && options.points.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
              {options.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="outline" onClick={() => onClose(false)}>
            {options.cancelLabel ?? "Cancel"}
          </Button>
          <Button ref={okRef} variant={TONES[tone].button} onClick={() => onClose(true)}>
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
