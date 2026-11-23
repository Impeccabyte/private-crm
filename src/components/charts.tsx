"use client";

import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, ComposedChart,
} from "recharts";

const axis = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false, axisLine: false } as const;
const tip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12, color: "var(--ink)" },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
  cursor: { fill: "var(--hover)" },
};

const fmtMoney = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
const fmtFull = (v: number) => "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export type Fmt = "money" | "number" | "pct";
const f = (fmt: Fmt) => (v: number) => (fmt === "money" ? fmtMoney(v) : fmt === "pct" ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString("en-US"));
const ft = (fmt: Fmt) => (v: number) => (fmt === "money" ? fmtFull(v) : fmt === "pct" ? `${Number(v).toFixed(2)}%` : Number(v).toLocaleString("en-US"));

export function TrendChart({ data, fmt = "money", label, compareLabel, height = 240 }: {
  data: { label: string; value: number | null; compare?: number | null; projected?: number | null }[]; fmt?: Fmt; label: string; compareLabel?: string; height?: number;
}) {
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={`${label} trend`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} tickFormatter={f(fmt)} width={56} />
          <Tooltip {...tip} formatter={(v) => ft(fmt)(Number(v))} />
          <Area type="monotone" dataKey="value" name={label} stroke="var(--accent)" strokeWidth={2} fill="color-mix(in srgb, var(--accent) 12%, transparent)" dot={{ r: 3, fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2 }} />
          {data.some((d) => d.projected != null) && <Line type="monotone" dataKey="projected" name="Projected" stroke="var(--ink-3)" strokeDasharray="4 4" dot={false} />}
          {compareLabel && <Line type="monotone" dataKey="compare" name={compareLabel} stroke="var(--ink-3)" strokeDasharray="4 4" dot={false} />}
          {(compareLabel || data.some((d) => d.projected != null)) && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, series, fmt = "money", height = 240, stacked }: {
  data: Record<string, string | number | null>[]; series: { key: string; label: string; color?: string }[]; fmt?: Fmt; height?: number; stacked?: boolean;
}) {
  const colors = ["var(--accent)", "var(--line-strong)", "color-mix(in srgb, var(--accent) 45%, var(--surface))"];
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={series.map((s) => s.label).join(" and ")}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} tickFormatter={f(fmt)} width={56} />
          <Tooltip {...tip} formatter={(v) => ft(fmt)(Number(v))} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? colors[i % colors.length]} radius={[3, 3, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={28} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLine({ data, fmt = "number", height = 220, label }: { data: { label: string; value: number }[]; fmt?: Fmt; height?: number; label: string }) {
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} tickFormatter={f(fmt)} width={48} />
          <Tooltip {...tip} formatter={(v) => ft(fmt)(Number(v))} />
          <Line type="monotone" dataKey="value" name={label} stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
