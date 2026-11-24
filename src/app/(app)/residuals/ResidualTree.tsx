"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { Avatar } from "@/components/ui";

export type Node = {
  id: string; kind: "agent" | "sub" | "group" | "mid"; label: string; sub?: string; tag?: string; href?: string; avatar?: { ini: string; color: string; photo: string | null };
  salesCount: number; salesAmount: number; revenue: number; expense: number; split: string; adjustment: number; adjustmentNote?: string | null;
  profit: number; held: number; heldNote?: string | null; children: Node[];
};

const usd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ResidualTree({ nodes, total, periodLabel }: { nodes: Node[]; total: Omit<Node, "id" | "kind" | "label" | "children" | "split">; periodLabel: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes.slice(0, 1).flatMap((n) => [n.id, ...n.children.map((c) => c.id)])));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = (ns: Node[]): string[] => ns.flatMap((n) => [n.id, ...all(n.children)]);
  const rows: { n: Node; depth: number }[] = [];
  const walk = (ns: Node[], depth: number) => { for (const n of ns) { rows.push({ n, depth }); if (open.has(n.id)) walk(n.children, depth + 1); } };
  walk(nodes, 0);
  return (
    <>
      <div className="row" style={{ padding: "8px 12px", gap: 6, borderBottom: "1px solid var(--line)" }}>
        <button className="btn sm" onClick={() => setOpen(new Set(all(nodes)))}>Expand all</button>
        <button className="btn sm" onClick={() => setOpen(new Set())}>Collapse all</button>
      </div>
      <div className="tblw">
        <table className="tbl tight" role="treegrid" aria-label="Residuals grouped by agent, sub-agent and merchant">
          <thead><tr><th>Agent / sub-agent / merchant · MID</th><th className="r">Sales count</th><th className="r">Sales volume</th><th className="r">Revenue</th><th className="r">Expense</th><th className="r">Split</th><th className="r">Adjustments</th><th className="r">Profit</th><th className="r">Held</th></tr></thead>
          <tbody>
            {rows.map(({ n, depth }) => (
              <tr key={n.id} className={n.kind === "agent" ? "grp" : n.kind === "mid" ? "" : "grp2"} aria-level={depth + 1} aria-expanded={n.children.length ? open.has(n.id) : undefined}>
                <td style={{ paddingLeft: 10 + depth * 28 }}>
                  <span className="row" style={{ gap: 6 }}>
                    {n.children.length > 0 && <button className="btn ghost sm icon" style={{ width: 24, height: 24 }} onClick={() => toggle(n.id)} aria-label={`${open.has(n.id) ? "Collapse" : "Expand"} ${n.label}`}><ChevronRight size={14} aria-hidden="true" className={`chev-r ${open.has(n.id) ? "on" : ""}`} /></button>}
                    {n.avatar && <Avatar initials={n.avatar.ini} color={n.avatar.color} avatarKey={n.avatar.photo} />}
                    {n.href ? <Link href={n.href} style={{ color: "var(--ink)", textDecoration: "none" }}>{n.label}</Link> : <span>{n.label}</span>}
                    {n.tag && <span className="tag">{n.tag}</span>}
                    {n.sub && <span className="mono subtle">{n.sub}</span>}
                  </span>
                </td>
                <td className="r">{n.salesCount.toLocaleString("en-US")}</td><td className="r">{usd(n.salesAmount)}</td><td className="r">{usd(n.revenue)}</td><td className="r muted">{usd(-n.expense)}</td><td className="r">{n.split}</td>
                <td className="r"><span className={n.adjustment ? "tx-red" : "subtle"} title={n.adjustmentNote ?? ""}>{usd(n.adjustment)}</span></td>
                <td className="r" style={{ fontWeight: 600 }}>{usd(n.profit)}</td>
                <td className="r">{n.held ? (
                  <span className="tipw" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="score" aria-describedby={`h-${n.id}`} style={{ color: "var(--a-ink)" }}><Lock size={14} aria-hidden="true" />{usd(n.held)}</button>
                    <span className="tip right" role="tooltip" id={`h-${n.id}`}><b style={{ display: "block", marginBottom: 4 }}>Held · {usd(n.held)}</b>{n.heldNote ?? "Includes holds on rows below."}</span>
                  </span>) : <span className="subtle">—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total · {periodLabel}</td><td className="r">{total.salesCount.toLocaleString("en-US")}</td><td className="r">{usd(total.salesAmount)}</td><td className="r">{usd(total.revenue)}</td><td className="r">{usd(-total.expense)}</td><td /><td className="r">{usd(total.adjustment)}</td><td className="r">{usd(total.profit)}</td><td className="r">{usd(total.held)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}
