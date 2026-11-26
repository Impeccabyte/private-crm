import Link from "next/link";
import { REQUEST_STATUS } from "@/lib/portal/data";

export const DISCLOSURE =
  "Merchant accounts are provided by Maverick Payments and its sponsor banks. Impeccabyte is an authorized sales agent of Maverick Payments.";

/** The Impeccabyte emblem: a card with three bytes rising from clay into amber. */
export function Emblem({ onDark = true }: { onDark?: boolean }) {
  return (
    <svg viewBox="8 14 84 84" aria-hidden="true">
      {!onDark && <rect x="8" y="14" width="84" height="84" rx="18" fill="#faf6ef" />}
      <rect x="16" y="60" width="68" height="30" rx="7" fill="#c0623e" />
      <rect x="28" y="46" width="11" height="11" rx="3.4" fill="#c0623e" />
      <rect x="43" y="34" width="11" height="11" rx="3.4" fill="#d17c56" />
      <rect x="58" y="22" width="11" height="11" rx="3.4" fill="#e0a04d" />
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link className="mp-logo" href={href}>
      <Emblem />
      <span>Impecca<b>byte</b></span>
    </Link>
  );
}

export function RequestBadge({ status, waiting }: { status: string; waiting?: boolean }) {
  if (waiting) return <span className="mp-badge warn">Waiting on you</span>;
  const s = REQUEST_STATUS[status] ?? { label: status, tone: "neutral" };
  return <span className={`mp-badge ${s.tone === "neutral" ? "" : s.tone}`}>{s.label}</span>;
}

export function DisputeBadge({ status, helping }: { status: string; helping?: boolean }) {
  if (status === "Won") return <span className="mp-badge ok">Decided for you</span>;
  if (status === "Lost") return <span className="mp-badge">Decided for the customer</span>;
  if (helping) return <span className="mp-badge info">We&apos;re on it</span>;
  return <span className="mp-badge danger">Open</span>;
}

/** "Nov 24" / "Mon, Nov 24" from a YYYY-MM-DD date. */
export const day = (d: string | null | undefined, weekday = false) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { ...(weekday ? { weekday: "short" } : {}), month: "short", day: "numeric", timeZone: "UTC" }) : "";

export const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export const when = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
