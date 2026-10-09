"use client";

import { Input } from "./ui";
import { todayISO } from "@/lib/client";

const PRESETS = [
  { label: "Today", from: 0, to: 0 },
  { label: "Yesterday", from: -1, to: -1 },
  { label: "7 days", from: -6, to: 0 },
  { label: "30 days", from: -29, to: 0 },
];

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {PRESETS.map((p) => {
          const f = todayISO(p.from);
          const t = todayISO(p.to);
          const active = f === from && t === to;
          return (
            <button
              key={p.label}
              onClick={() => onChange({ from: f, to: t })}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} className="h-10 w-auto" />
        <span className="text-slate-400">to</span>
        <Input type="date" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} className="h-10 w-auto" />
      </div>
    </div>
  );
}
