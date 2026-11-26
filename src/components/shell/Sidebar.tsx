"use client";

import { Emblem } from "@/components/Emblem";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Home, UserPlus, Columns3, Store, FileCheck2, MessageCircle, RotateCcw, BarChart3, DollarSign, SlidersHorizontal, PanelLeft, X, Mail,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: string; count?: number };

const ICONS: Record<string, LucideIcon> = {
  home: Home, leads: UserPlus, deals: Columns3, merchants: Store, applications: FileCheck2, support: MessageCircle,
  chargebacks: RotateCcw, reports: BarChart3, residuals: DollarSign, settings: SlidersHorizontal, email: Mail,
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export function Sidebar({ items, company, lastSync, syncFailed, hasConnections }: { items: NavItem[]; company: string; lastSync: string | null; syncFailed: boolean; hasConnections: boolean }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => { try { setCollapsed(localStorage.getItem("ib-sb") === "1"); } catch { /* ignore */ } }, []);
  const toggle = () => { const n = !collapsed; setCollapsed(n); try { localStorage.setItem("ib-sb", n ? "1" : "0"); } catch { /* ignore */ } };

  // Below 768px the sidebar becomes an off-canvas drawer, opened from the top bar's menu button.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => { setMobile(mq.matches); if (!mq.matches) setOpen(false); };
    sync();
    mq.addEventListener("change", sync);
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("ib:nav", onToggle);
    return () => { mq.removeEventListener("change", sync); window.removeEventListener("ib:nav", onToggle); };
  }, []);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    navRef.current?.querySelector<HTMLElement>("a.nv.on, a.nv")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
    <div className={`side-col ${open ? "open" : ""}`} id="primary-nav">
    <nav ref={navRef} className={`sb ${mobile ? "drawer" : collapsed ? "collapsed" : ""}`} aria-label="Primary">
      <div className="ws">
        <Emblem className="logo" />
        <div className="lbl ws-txt">
          <span className="ws-name">{company}</span>
          <span className="ws-sub">Merchant CRM</span>
        </div>
        <button className="btn ghost icon sb-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={16} aria-hidden="true" /></button>
      </div>
      {items.map((it) => {
        const Icon = ICONS[it.icon] ?? Home;
        const on = it.href === "/ase" ? path === "/ase" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={`nv ${on ? "on" : ""}`} aria-current={on ? "page" : undefined} title={it.label}>
            <Icon size={16} aria-hidden="true" />
            <span className="lbl">{it.label}</span>
            {it.count ? <span className="lbl cnt" aria-label={`${it.count} open`}>{it.count}</span> : null}
          </Link>
        );
      })}
      <div className="grow" />
      {hasConnections && (
        <div className="lbl sync-card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}>
            <span className="dotg" aria-hidden="true" style={syncFailed ? { background: "var(--r-ink)", boxShadow: "0 0 0 3px var(--r-bg)" } : undefined} />
            {syncFailed ? "Last sync failed" : "Processor sync healthy"}
          </div>
          <div className="subtle sm">{lastSync ? `Last sync ${ago(lastSync)}` : "Not synced yet"}</div>
        </div>
      )}
      <button className="collapse" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
        <PanelLeft size={16} aria-hidden="true" />
        <span className="lbl">Collapse</span>
      </button>
    </nav>
    </div>
    {open && <div className="drawer-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
