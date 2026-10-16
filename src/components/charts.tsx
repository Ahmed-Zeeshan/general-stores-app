"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPKR } from "@/lib/money";
import { useLang, useT } from "@/lib/i18n";

const shortDay = (d: string) =>
  new Intl.DateTimeFormat("en-PK", { weekday: "short", day: "numeric" }).format(new Date(`${d}T12:00:00`));
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SalesBarChart({
  data,
  showProfit = true,
  height = 280,
}: {
  data: { date: string; total: number; profit: number }[];
  showProfit?: boolean;
  height?: number;
}) {
  const t = useT();
  const { lang } = useLang();
  // English keeps the browser's format; Urdu / Roman Urdu: translated weekday + day number.
  const day = (d: string) => {
    if (lang === "en") return shortDay(d);
    const dt = new Date(`${d}T12:00:00`);
    return `${t(WEEKDAYS[dt.getDay()])} ${dt.getDate()}`;
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="date" tickFormatter={day} tickLine={false} axisLine={false} fontSize={12} stroke="#64748b" />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="#64748b"
          width={56}
          tickFormatter={(v: number) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          formatter={(v: number, name: string) => [formatPKR(v), t(name === "total" ? "Sales" : "Profit")]}
          labelFormatter={(d: string) => day(d)}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}
        />
        <Bar dataKey="total" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={36} />
        {showProfit && <Bar dataKey="profit" fill="#a7f3d0" radius={[6, 6, 0, 0]} maxBarSize={36} />}
      </BarChart>
    </ResponsiveContainer>
  );
}
