"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Store, UserPlus, MessageCircle, FileCheck2 } from "lucide-react";

type Result = { id: string; kind: "merchant" | "lead" | "application"; title: string; sub: string; why: string; status: string; href: string };

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) { setResults((await r.json()).results); setActive(0); }
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const actions = [
    { title: "Create lead", href: "/leads?new=1", icon: UserPlus },
    { title: "Create ticket", href: "/support?new=1", icon: MessageCircle },
  ];
  const total = results.length + actions.length;
  const go = (href: string) => { onClose(); router.push(href); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const href = active < results.length ? results[active]?.href : actions[active - results.length]?.href;
      if (href) go(href);
    }
  };

  const Icon = (k: Result["kind"]) => (k === "lead" ? UserPlus : k === "application" ? FileCheck2 : Store);

  return (
    <div className="palette-wrap" onKeyDown={onKey}>
      <div className="scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="pin">
          <Search size={16} aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search DBA, MID, EIN last 4, contact, phone, email"
            aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={`pr-${active}`} />
          <button className="btn ghost sm" onClick={onClose} aria-label="Close search"><span className="kbd">esc</span></button>
        </div>
        <div id="palette-list" role="listbox" style={{ maxHeight: 420, overflowY: "auto" }}>
          <div className="grp">{q ? `Results · ${results.length}${loading ? "…" : ""}` : "Recent merchants"}</div>
          {results.map((r, i) => {
            const I = Icon(r.kind);
            return (
              <a key={r.kind + r.id} id={`pr-${i}`} role="option" aria-selected={i === active} className={`res ${i === active ? "act" : ""}`} href={r.href}
                onClick={(e) => { e.preventDefault(); go(r.href); }} onMouseEnter={() => setActive(i)}>
                <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--sunken)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--ink-2)" }}><I size={14} aria-hidden="true" /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: "block", fontWeight: 500 }}>{r.title}</span>
                  <span className="subtle sm num ellipsis" style={{ display: "block" }}>{r.sub}</span>
                </span>
                <span className="row" style={{ gap: 6 }}><span className="tag acc">{r.why}</span><span className="tag">{r.status}</span></span>
              </a>
            );
          })}
          {q && !loading && results.length === 0 && <div className="subtle" style={{ padding: 14 }}>No matches for “{q}”. Try a MID, the last 4 of an EIN, or a phone number.</div>}
          <div className="grp">Actions</div>
          {actions.map((a, j) => {
            const i = results.length + j;
            return (
              <a key={a.href} id={`pr-${i}`} role="option" aria-selected={i === active} className={`res ${i === active ? "act" : ""}`} href={a.href}
                onClick={(e) => { e.preventDefault(); go(a.href); }} onMouseEnter={() => setActive(i)}>
                <span style={{ width: 28, display: "grid", placeItems: "center", color: "var(--ink-2)" }}><a.icon size={14} aria-hidden="true" /></span>
                <span>{a.title}</span><span />
              </a>
            );
          })}
        </div>
        <div className="foot"><span className="row" style={{ gap: 4 }}><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span><span className="row" style={{ gap: 4 }}><span className="kbd">↵</span> open</span><span className="row" style={{ gap: 4 }}><span className="kbd">esc</span> close</span><span className="sp" /><span>EINs are always masked</span></div>
      </div>
    </div>
  );
}
