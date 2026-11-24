"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Clock, FileCheck2, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui";
import { moveDeal } from "./actions";

type Stage = "new_lead" | "contacted" | "qualified" | "proposal" | "application_sent" | "won" | "lost";
type Deal = { id: string; name: string; amount: number; stage: Stage; owner: string | null; ownerIni: string; color: string | null; photo: string | null; days: number; lostReason: string | null; merchantId: string | null; app: { id: string; number: string; status: string } | null };

const STAGES: { key: Stage; label: string; prob: number; tone: string }[] = [
  { key: "new_lead", label: "New Lead", prob: 0.1, tone: "t-neutral" }, { key: "contacted", label: "Contacted", prob: 0.2, tone: "t-blue" },
  { key: "qualified", label: "Qualified", prob: 0.4, tone: "t-blue" }, { key: "proposal", label: "Pricing/Proposal", prob: 0.6, tone: "t-amber" },
  { key: "application_sent", label: "Application Sent", prob: 0.8, tone: "t-amber" }, { key: "won", label: "Won", prob: 1, tone: "t-green" }, { key: "lost", label: "Lost", prob: 0, tone: "t-red" },
];
const short = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

export function Kanban({ deals, canEdit }: { deals: Deal[]; canEdit: boolean }) {
  const router = useRouter();
  const [items, apply] = useOptimistic(deals, (s, u: { id: string; stage: Stage }) => s.map((d) => (d.id === u.id ? { ...d, stage: u.stage, days: 0 } : d)));
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const move = (id: string, stage: Stage) => {
    let reason: string | undefined;
    if (stage === "lost") { reason = window.prompt("Why was this deal lost?") ?? undefined; if (!reason) return; }
    setMenu(null); setError(null);
    start(async () => {
      apply({ id, stage });
      const r = await moveDeal(id, stage, reason);
      if (r.error) setError(r.error);
      else if (r.next) router.push(r.next);
    });
  };

  return (
    <>
      {error && <div className="notice flash-err" role="alert">{error}</div>}
      <div className="kb" role="list" aria-label="Deal stages">
        {STAGES.map((s) => {
          const cards = items.filter((d) => d.stage === s.key);
          const total = cards.reduce((a, d) => a + d.amount, 0);
          return (
            <section key={s.key} className="col" role="listitem" aria-label={`${s.label}, ${cards.length} deals, weighted ${short(total * s.prob)}`}
              style={over === s.key ? { outline: "2px dashed var(--accent)", outlineOffset: -2 } : undefined}
              onDragOver={(e) => { if (canEdit && dragId) { e.preventDefault(); setOver(s.key); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) move(dragId, s.key); setDragId(null); }}>
              <div className="col-h">
                <div className="t"><span className={`pill ${s.tone}`}>{s.label}</span><span className="ct">{cards.length}</span></div>
                <div className="m">{s.key === "lost" ? "0%" : `${Math.round(s.prob * 100)}%`} · weighted <b style={{ color: "var(--ink)" }}>{short(total * s.prob)}</b></div>
              </div>
              {cards.map((d) => (
                <div key={d.id} className={`kc ${dragId === d.id ? "drag" : ""}`} draggable={canEdit} onDragStart={() => setDragId(d.id)} onDragEnd={() => setDragId(null)}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    {d.merchantId ? <Link className="n" href={`/merchants/${d.merchantId}`} style={{ color: "var(--ink)", textDecoration: "none", flex: 1 }}>{d.name}</Link> : <span className="n" style={{ flex: 1 }}>{d.name}</span>}
                    {canEdit && (
                      <span className="rel">
                        <button className="btn ghost sm icon" style={{ height: 24, width: 24 }} aria-label={`Move ${d.name} to another stage`} aria-expanded={menu === d.id} onClick={() => setMenu(menu === d.id ? null : d.id)}><MoreHorizontal size={14} aria-hidden="true" /></button>
                        {menu === d.id && (
                          <span className="pop" role="menu" style={{ width: 200, display: "block" }}>
                            <span className="subtle sm" style={{ display: "block", padding: "4px 8px" }}>Move to</span>
                            {STAGES.filter((x) => x.key !== d.stage).map((x) => <button key={x.key} className="mi" role="menuitem" onClick={() => move(d.id, x.key)}>{x.label}</button>)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="meta"><span>${d.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo</span><span className="sp" /><span className="tag" title="Stage probability">{s.key === "lost" ? "0%" : `${Math.round(s.prob * 100)}%`}</span></div>
                  <div className="meta">
                    <Avatar initials={d.ownerIni} color={d.color} avatarKey={d.photo} title={d.owner ?? "Unassigned"} /><span className="nm">{d.owner ?? "Unassigned"}</span><span className="sp" />
                    <span className={d.days > 14 ? "over" : d.days > 7 ? "stale" : ""}><Clock size={12} aria-hidden="true" style={{ verticalAlign: -2 }} /> {s.key === "lost" ? "Closed" : `${d.days}d`}</span>
                  </div>
                  {d.lostReason && <div className="subtle sm">{d.lostReason}</div>}
                  {s.key === "won" && (d.app
                    ? <Link className="lnk" href={`/applications/${d.app.id}`}><FileCheck2 size={12} aria-hidden="true" />{d.app.number} · {d.app.status}</Link>
                    : canEdit && <Link className="btn sm pri" href={`/applications/new?deal=${d.id}`} style={{ width: "100%" }}><FileCheck2 size={14} aria-hidden="true" />Create boarding application</Link>)}
                </div>
              ))}
              {cards.length === 0 && <div className="subtle sm" style={{ padding: "8px 4px" }}>No deals</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
