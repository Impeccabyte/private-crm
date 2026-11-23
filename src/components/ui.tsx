/**
 * Shared presentational primitives (server-safe). Classes come from globals.css (ported from the design canvas).
 * Status colours are consistent app-wide and always paired with an icon + text label.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Circle, Clock, CircleDashed, CheckCircle2, XCircle, MinusCircle, type LucideIcon } from "lucide-react";

export type Tone = "neutral" | "blue" | "amber" | "green" | "red" | "gray";

const TONE: Record<string, Tone> = {
  New: "neutral", Unsigned: "neutral", Prospect: "neutral", prospect: "neutral", "Not started": "neutral", none: "neutral",
  Pending: "blue", "In Progress": "blue", Processed: "blue", Boarding: "blue", boarding: "blue", retrying: "blue", received: "blue", draft: "blue", running: "blue",
  Underwriting: "amber", "On Hold": "amber", "Partially Signed": "amber", Conditional: "amber", "Due soon": "amber", Held: "amber", partial: "amber", submitted: "amber",
  Approved: "green", Signed: "green", Won: "green", Live: "green", live: "green", Passed: "green", Connected: "green", Active: "green", active: "green",
  Uploaded: "green", Deposited: "green", processed: "green", succeeded: "green", complete: "green", Match: "green",
  Declined: "red", Rejected: "red", Lost: "red", Failed: "red", Overdue: "red", Missing: "red", "SLA breached": "red", failed: "red", rejected: "red", missing: "red", Elevated: "red",
  Cancelled: "gray", Closed: "gray", closed: "gray", Inactive: "gray", Deactivated: "gray", disabled: "gray", invited: "blue", ignored: "gray", accepted: "gray",
};
const ICON: Record<Tone, LucideIcon> = { neutral: CircleDashed, blue: Clock, amber: Circle, green: CheckCircle2, red: XCircle, gray: MinusCircle };

export const toneOf = (status: string): Tone => TONE[status] ?? "neutral";

export function Pill({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  const t = tone ?? toneOf(status);
  const Icon = ICON[t];
  return (
    <span className={`pill t-${t}`}>
      <Icon aria-hidden="true" strokeWidth={2.25} />
      {label ?? status}
    </span>
  );
}

export function Proc({ name = "Maverick", suffix }: { name?: string; suffix?: string }) {
  return (
    <span className="proc" title={`Processor: ${name}`}>
      <span className="pm" aria-hidden="true">{name[0]}</span>
      {name}{suffix ? ` · ${suffix}` : ""}
    </span>
  );
}

export function Avatar({ initials, color, size, title }: { initials: string; color?: string | null; size?: "lg" | "xl"; title?: string }) {
  return <span className={`av ${color ?? "av-6"} ${size ?? ""}`} title={title} aria-label={title}>{initials}</span>;
}

export function Who({ name, color }: { name?: string | null; color?: string | null }) {
  if (!name) return <span className="subtle">Unassigned</span>;
  const ini = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className="who"><Avatar initials={ini} color={color} />{name}</span>;
}

export function Card({ title, actions, children, className = "", bodyClass, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={id}>
      {title !== undefined && (
        <div className="card-h">
          <h2 id={id}>{title}</h2>
          {actions}
        </div>
      )}
      {bodyClass === undefined ? children : <div className={bodyClass}>{children}</div>}
    </section>
  );
}

export function Kpi({ label, value, delta, deltaDir, sub, href }: { label: string; value: string; delta?: string; deltaDir?: "up" | "dn" | "flat"; sub?: string; href?: string }) {
  const inner = (
    <>
      <span className="l">{label}</span>
      <span className="v">{value}</span>
      <span className="s">
        {delta && <span className={`delta ${deltaDir === "flat" ? "" : deltaDir ?? ""}`}>{deltaDir === "up" ? "↑" : deltaDir === "dn" ? "↓" : "→"} {delta}</span>}
        {sub}
      </span>
    </>
  );
  return href ? <Link className="card kpi" href={href}>{inner}</Link> : <div className="card kpi">{inner}</div>;
}

export function Empty({ icon: Icon, title, children, actions }: { icon: LucideIcon; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <span className="ei"><Icon size={20} aria-hidden="true" /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="ph">
      <div>
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb" style={{ marginBottom: 4 }}>
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <b aria-current="page">{c.label}</b>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, base }: { tabs: { key: string; label: string; count?: number | null }[]; active: string; base: string }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <Link key={t.key} href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`} className={`tab ${active === t.key ? "on" : ""}`} role="tab" aria-selected={active === t.key} scroll={false}>
          {t.label}{t.count ? <span className="c">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Banner({ tone, title, children, icon: Icon }: { tone: "amber" | "red" | "blue"; title: ReactNode; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className={`banner ${tone}`} role={tone === "red" ? "alert" : "status"}>
      {Icon && <Icon size={16} aria-hidden="true" style={{ marginTop: 2, flex: "none" }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="bt">{title}</div>
        {children && <div className="bd sm">{children}</div>}
      </div>
    </div>
  );
}

export function Flash({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (!ok && !error) return null;
  return <div className={`notice ${error ? "flash-err" : "flash-ok"}`} role={error ? "alert" : "status"}>{error ?? ok}</div>;
}
