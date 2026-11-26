const TZ = "America/New_York";

/**
 * Negative amounts are written the formal accounting way, in parentheses with no minus sign: ($1,234.56).
 * Every money, count and percent formatter here and in the merchant portal goes through this.
 */
export const paren = (negative: boolean, s: string) => (negative ? `(${s})` : s);

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return paren(Math.round(n * 100) < 0, "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
export const usd0 = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : paren(Math.round(n) < 0, "$" + Math.round(Math.abs(n)).toLocaleString("en-US"));
export function short(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return paren(n < 0, `$${(a / 1e6).toFixed(2)}M`);
  if (a >= 1e3) return paren(n < 0, `$${(a / 1e3).toFixed(1)}K`);
  return usd(n);
}
export const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : paren(n < 0, Math.abs(n).toLocaleString("en-US")));
export const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : paren(Number(n.toFixed(digits)) < 0, `${Math.abs(n).toFixed(digits)}%`);
/** A change: +4.2% when up, (4.2%) when down. */
export const signedPct = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n >= 0 ? `+${n.toFixed(1)}%` : `(${Math.abs(n).toFixed(1)}%)`;

const toDate = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00Z" : d) : d) : null);

/** "Nov 14, 2026" */
export function fmtDate(d: Date | string | null | undefined): string {
  const x = toDate(d);
  return x ? x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ }) : "—";
}
/** "Nov 14, 2026 4:12 PM" */
export function fmtDateTime(d: Date | string | null | undefined): string {
  const x = toDate(d);
  return x ? `${fmtDate(x)} ${x.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}` : "—";
}
export function fmtTime(d: Date | string | null | undefined): string {
  const x = toDate(d);
  return x ? x.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }) : "—";
}
export function relTime(d: Date | string | null | undefined, now = Date.now()): string {
  const x = toDate(d);
  if (!x) return "—";
  const s = Math.round((now - x.getTime()) / 1000);
  const future = s < 0, a = Math.abs(s);
  const out = a < 60 ? "just now" : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : a < 86400 * 30 ? `${Math.round(a / 86400)}d` : fmtDate(x);
  if (out === "just now" || out === fmtDate(x)) return out;
  return future ? `in ${out}` : `${out} ago`;
}
/** Whole days from today to a date (negative = past). */
export function daysUntil(d: Date | string | null | undefined): number | null {
  const x = toDate(d);
  if (!x) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(x); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}
export const daysSince = (d: Date | string | null | undefined) => { const n = daysUntil(d); return n === null ? null : -n; };

export function minutesLabel(mins: number): string {
  const a = Math.abs(mins);
  const h = Math.floor(a / 60), m = Math.round(a % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const STAGE_LABEL: Record<string, string> = {
  new_lead: "New Lead", contacted: "Contacted", qualified: "Qualified", proposal: "Pricing/Proposal",
  application_sent: "Application Sent", won: "Won", lost: "Lost",
};
export const STAGE_PROB: Record<string, number> = {
  new_lead: 0.1, contacted: 0.2, qualified: 0.4, proposal: 0.6, application_sent: 0.8, won: 1, lost: 0,
};
export const STAGES = ["new_lead", "contacted", "qualified", "proposal", "application_sent", "won", "lost"] as const;

export const SOURCE_LABEL: Record<string, string> = { web_form: "Web form", referral: "Referral", import: "Import", partner: "Partner", manual: "Manual" };
export const MERCHANT_STATUS_LABEL: Record<string, string> = { prospect: "Prospect", boarding: "Boarding", live: "Live", closed: "Closed" };

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n");
}
