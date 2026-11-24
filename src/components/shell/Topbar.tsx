"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, MessageCircle, Plus, Search, Store, UserPlus, CheckSquare, Settings2 } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { logoutAction } from "@/app/(auth)/actions";
import { Avatar } from "../ui";

type Note = { id: string; title: string; sub: string; at: string; href: string };

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

export function Topbar({ user, canCreate, notifications }: {
  user: { name: string; email: string; initials: string; avatarColor: string; avatarKey: string | null; roleLabel: string };
  canCreate: { lead: boolean; ticket: boolean; merchant: boolean };
  notifications: Note[];
}) {
  const [open, setOpen] = useState<"" | "new" | "bell" | "user">("");
  const [palette, setPalette] = useState(false);
  const close = () => setOpen("");
  const newRef = useOutside(open === "new", close);
  const bellRef = useOutside(open === "bell", close);
  const userRef = useOutside(open === "user", close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="tb">
      <button className="btn ghost icon nav-btn" onClick={() => window.dispatchEvent(new Event("ib:nav"))} aria-label="Open navigation" aria-controls="primary-nav">
        <Menu size={18} aria-hidden="true" />
      </button>
      <button className="search" onClick={() => setPalette(true)} aria-haspopup="dialog" aria-label="Search merchants (Command K)">
        <Search size={16} aria-hidden="true" />
        <span className="t">Search DBA, MID, EIN last 4, contact, phone, email…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div style={{ flex: 1 }} />
      <ThemeToggle />
      <div className="rel" ref={bellRef}>
        <button className="btn ghost icon" onClick={() => setOpen(open === "bell" ? "" : "bell")} aria-label={`Notifications, ${notifications.length} recent`} aria-expanded={open === "bell"}>
          <Bell size={16} aria-hidden="true" />
          {notifications.length > 0 && <span className="dotbadge" aria-hidden="true">{Math.min(notifications.length, 9)}</span>}
        </button>
        {open === "bell" && (
          <div className="pop" style={{ width: 360, padding: 0 }} role="dialog" aria-label="Notifications">
            <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ fontWeight: 600 }}>Processor events</b></div>
            {notifications.length === 0 && <div className="subtle" style={{ padding: 14 }}>Nothing new.</div>}
            {notifications.map((n) => (
              <Link key={n.id} className="att" href={n.href} onClick={close} style={{ padding: "10px 14px", gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span style={{ minWidth: 0 }}><span className="t1" style={{ display: "block" }}>{n.title}</span><span className="t2" style={{ display: "block" }}>{n.sub}</span></span>
                <span className="subtle sm">{new Date(n.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {(canCreate.lead || canCreate.ticket || canCreate.merchant) && (
        <div className="rel" ref={newRef}>
          <button className="btn pri" onClick={() => setOpen(open === "new" ? "" : "new")} aria-expanded={open === "new"} aria-haspopup="menu" aria-label="Create new">
            <Plus size={16} aria-hidden="true" /><span className="new-lbl">New</span><ChevronDown size={12} aria-hidden="true" className="new-lbl" />
          </button>
          {open === "new" && (
            <div className="pop" role="menu" style={{ width: 220 }}>
              {canCreate.lead && <Link className="mi" role="menuitem" href="/leads?new=1" onClick={close}><UserPlus size={16} aria-hidden="true" />Lead</Link>}
              {canCreate.merchant && <Link className="mi" role="menuitem" href="/merchants?new=1" onClick={close}><Store size={16} aria-hidden="true" />Merchant</Link>}
              {canCreate.ticket && <Link className="mi" role="menuitem" href="/support?new=1" onClick={close}><MessageCircle size={16} aria-hidden="true" />Ticket</Link>}
              <Link className="mi" role="menuitem" href="/?task=new" onClick={close}><CheckSquare size={16} aria-hidden="true" />Task</Link>
            </div>
          )}
        </div>
      )}
      <div className="rel" ref={userRef}>
        <button className="btn ghost" style={{ padding: "0 4px" }} onClick={() => setOpen(open === "user" ? "" : "user")} aria-label={`${user.name}, account menu`} aria-expanded={open === "user"}>
          <Avatar initials={user.initials} color={user.avatarColor} avatarKey={user.avatarKey} size="lg" />
        </button>
        {open === "user" && (
          <div className="pop" role="menu" style={{ width: 240 }}>
            <div style={{ padding: "8px 8px 10px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="subtle sm">{user.email}</div>
              <div className="tag" style={{ marginTop: 6 }}>{user.roleLabel}</div>
            </div>
            <Link className="mi" role="menuitem" href="/account" onClick={close}><Settings2 size={16} aria-hidden="true" />Profile &amp; password</Link>
            <form action={logoutAction}><button className="mi" role="menuitem" type="submit"><LogOut size={16} aria-hidden="true" />Sign out</button></form>
          </div>
        )}
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </header>
  );
}
