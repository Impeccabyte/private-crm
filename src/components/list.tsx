"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Columns3, Plus, X } from "lucide-react";

/** Comfortable / compact rows, remembered per browser. Applies to every table. */
export function DensityToggle() {
  const [d, setD] = useState<"comfortable" | "compact">("comfortable");
  useEffect(() => {
    try { const v = localStorage.getItem("ib-density"); if (v === "compact") { setD("compact"); document.documentElement.dataset.density = "compact"; } } catch { /* ignore */ }
  }, []);
  const set = (v: "comfortable" | "compact") => {
    setD(v); document.documentElement.dataset.density = v;
    try { localStorage.setItem("ib-density", v); } catch { /* ignore */ }
  };
  return (
    <div className="seg" role="group" aria-label="Row density">
      <button type="button" className={d === "comfortable" ? "on" : ""} aria-pressed={d === "comfortable"} onClick={() => set("comfortable")}>Comfortable</button>
      <button type="button" className={d === "compact" ? "on" : ""} aria-pressed={d === "compact"} onClick={() => set("compact")}>Compact</button>
    </div>
  );
}

/** Show/hide columns. Cells carry `col-<key>`; hidden choices persist per table. */
export function ColumnChooser({ tableId, columns }: { tableId: string; columns: { key: string; label: string }[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { try { setHidden(JSON.parse(localStorage.getItem(`ib-cols-${tableId}`) ?? "[]")); } catch { /* ignore */ } }, [tableId]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const toggle = (k: string) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next); try { localStorage.setItem(`ib-cols-${tableId}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return (
    <div className="rel" ref={ref}>
      <style>{hidden.map((k) => `#${tableId} .col-${k}{display:none}`).join("")}</style>
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"><Columns3 size={14} aria-hidden="true" />Columns</button>
      {open && (
        <div className="pop" style={{ width: 220 }} role="group" aria-label="Visible columns">
          {columns.map((c) => (
            <label key={c.key} className="mi" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} />{c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Built-in views plus views the user saves (stored per browser). */
export function SavedViews({ id, base, views }: { id: string; base: string; views: { label: string; query: string; count?: number | null }[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [custom, setCustom] = useState<{ label: string; query: string }[]>([]);
  useEffect(() => { try { setCustom(JSON.parse(localStorage.getItem(`ib-views-${id}`) ?? "[]")); } catch { /* ignore */ } }, [id]);
  const current = new URLSearchParams(sp.toString());
  ["page", "new", "cb", "t", "lead", "sel"].forEach((k) => current.delete(k));
  const cur = current.toString();
  const save = () => {
    const label = window.prompt("Name this view");
    if (!label) return;
    const next = [...custom.filter((v) => v.label !== label), { label, query: cur }];
    setCustom(next); try { localStorage.setItem(`ib-views-${id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const remove = (label: string) => {
    const next = custom.filter((v) => v.label !== label);
    setCustom(next); try { localStorage.setItem(`ib-views-${id}`, JSON.stringify(next)); } catch { /* ignore */ }
    router.push(base);
  };
  const all = [...views, ...custom.map((c) => ({ ...c, count: null, custom: true }))];
  return (
    <div className="views" role="tablist" aria-label="Saved views">
      {all.map((v) => {
        const on = v.query === cur;
        return (
          <span key={v.label} className="row" style={{ gap: 0 }}>
            <Link href={`${base}${v.query ? `?${v.query}` : ""}`} className={`vt ${on ? "on" : ""}`} role="tab" aria-selected={on}>
              {v.label}{v.count != null && <span className="c">{v.count}</span>}
            </Link>
            {"custom" in v && on && <button type="button" className="btn ghost sm icon" aria-label={`Delete view ${v.label}`} onClick={() => remove(v.label)}><X size={12} aria-hidden="true" /></button>}
          </span>
        );
      })}
      <button type="button" className="vt" onClick={save}><Plus size={14} aria-hidden="true" />Save view</button>
    </div>
  );
}

/** Header checkbox that toggles every row checkbox bound to the given form id. */
export function SelectAll({ form, label = "Select all" }: { form: string; label?: string }) {
  return (
    <input type="checkbox" aria-label={label} onChange={(e) => {
      document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"]`).forEach((c) => { c.checked = e.target.checked; });
      document.dispatchEvent(new Event(`sel-${form}`));
    }} />
  );
}

/** Shows the bulk bar only when at least one row is selected. */
export function BulkBar({ form, children }: { form: string; children: ReactNode }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(document.querySelectorAll(`input[type=checkbox][form="${form}"]:checked`).length);
    const onChange = (e: Event) => { if ((e.target as HTMLInputElement)?.getAttribute?.("form") === form) count(); };
    document.addEventListener("change", onChange); document.addEventListener(`sel-${form}`, count);
    return () => { document.removeEventListener("change", onChange); document.removeEventListener(`sel-${form}`, count); };
  }, [form]);
  if (!n) return null;
  return <div className="bulk" role="region" aria-label="Bulk actions"><span>{n} selected</span>{children}</div>;
}

/** Side sheet driven by a URL param: closing navigates to `closeHref`. Esc closes; focus moves into the sheet. */
export function Sheet({ title, sub, closeHref, children, footer, width = 520 }: { title: ReactNode; sub?: ReactNode; closeHref: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(closeHref, { scroll: false }); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return (
    <div className="sheet-wrap">
      <Link className="scrim" href={closeHref} scroll={false} aria-label="Close panel" tabIndex={-1} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} tabIndex={-1} ref={ref} style={{ width }}>
        <div className="sheet-h">
          <div style={{ flex: 1, minWidth: 0 }}>{sub && <div className="subtle sm">{sub}</div>}<h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 600 }}>{title}</h2></div>
          <Link className="btn ghost icon" href={closeHref} scroll={false} aria-label="Close"><X size={16} aria-hidden="true" /></Link>
        </div>
        <div className="sheet-b">{children}</div>
        {footer && <div className="sheet-f">{footer}</div>}
      </aside>
    </div>
  );
}

/** ↑/↓ moves focus between row links in a table body (Enter follows the link). */
export function KeyNavTable({ children }: { children: ReactNode }) {
  return (
    <div className="tblw" onKeyDown={(e) => {
      if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
      const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-nav]"));
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (i < 0) return;
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
    }}>{children}</div>
  );
}
