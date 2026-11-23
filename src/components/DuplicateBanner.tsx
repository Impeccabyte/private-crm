"use client";

import Link from "next/link";
import { AlertTriangle, Link2, Merge } from "lucide-react";
import type { DupMatch } from "@/lib/duplicates";

/**
 * Inline "Possible duplicate" banner with a side-by-side compare and Merge / Link / Create anyway actions.
 * Create anyway re-submits the surrounding form with `createAnywayName=yes`.
 */
export function DuplicateBanner({ incoming, matches, createAnywayName, onMerge, onLink }: {
  incoming: Record<string, string>; matches: DupMatch[]; createAnywayName: string;
  onMerge?: (m: DupMatch) => React.ReactNode; onLink?: (m: DupMatch) => React.ReactNode;
}) {
  const top = matches[0]!;
  const inc: Record<string, string | undefined> = {
    "Business name": incoming.dbaName ?? incoming.businessName, Phone: incoming.csPhone ?? incoming.phone,
    "Website domain": (incoming.website ?? incoming.email ?? "").replace(/^https?:\/\//, "").replace(/^.*@/, "").replace(/\/.*$/, "") || undefined,
    EIN: incoming.ein ? `••-•••${incoming.ein.replace(/\D/g, "").slice(-4)}` : incoming.einLast4 ? `••-•••${incoming.einLast4}` : undefined, MID: incoming.mid, Address: [incoming.street, incoming.city].filter(Boolean).join(", ") || undefined,
  };
  return (
    <div className="card" style={{ overflow: "hidden", borderColor: "color-mix(in srgb, var(--a-ink) 30%, var(--line))" }}>
      <div className="banner amber" style={{ borderRadius: 0, borderWidth: "0 0 1px 0" }}>
        <AlertTriangle size={16} aria-hidden="true" style={{ marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div className="bt">Possible duplicate · {top.confidence} confidence</div>
          <div className="bd sm">“{inc["Business name"]}” matches the existing {top.kind} <b>{top.name}</b> on <b>{top.reasons.join(", ")}</b>.{matches.length > 1 ? ` ${matches.length - 1} other possible match${matches.length > 2 ? "es" : ""}.` : ""}</div>
        </div>
      </div>
      <table className="tbl compact" aria-label="Compare with existing record">
        <thead><tr><th>Field</th><th>New</th><th>Existing {top.kind}</th></tr></thead>
        <tbody>
          {top.fields.map((f) => {
            const a = inc[f.label]; const same = a && f.value && a.toLowerCase().replace(/\D/g, "") === f.value.toLowerCase().replace(/\D/g, "") && /\d/.test(a);
            const sameText = a && f.value && a.toLowerCase() === f.value.toLowerCase();
            return <tr key={f.label}><td className="muted">{f.label}</td><td style={{ whiteSpace: "normal" }}>{a ?? "—"}</td><td style={{ whiteSpace: "normal" }}>{f.value ?? "—"}{(same || sameText) && <span className="pill t-green" style={{ marginLeft: 6 }}>Match</span>}</td></tr>;
          })}
        </tbody>
      </table>
      <div className="row w" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", background: "var(--sunken)", gap: 8 }}>
        <span className="subtle sm" style={{ flex: 1 }}>Merge keeps the existing record. Link adds this as another location under the same legal entity.</span>
        <button className="btn sm ghost" type="submit" name={createAnywayName} value="yes">Create anyway</button>
        {onLink ? onLink(top) : top.kind === "merchant" && <Link className="btn sm" href={`/merchants/${top.id}`}><Link2 size={14} aria-hidden="true" />Open existing</Link>}
        {onMerge?.(top) ?? (top.kind === "merchant"
          ? <Link className="btn sm pri" href={`/merchants/${top.id}`}><Merge size={14} aria-hidden="true" />Use existing merchant</Link>
          : <Link className="btn sm pri" href={`/leads?lead=${top.id}`}><Merge size={14} aria-hidden="true" />Open existing lead</Link>)}
      </div>
    </div>
  );
}
