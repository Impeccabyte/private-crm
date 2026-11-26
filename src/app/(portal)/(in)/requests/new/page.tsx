import Link from "next/link";
import type { Metadata } from "next";
import { CircleHelp, Plane, ShieldAlert, UserCog, Wrench, type LucideIcon } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/dal";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { fmtUsd, getOwnChargeback } from "@/lib/portal/data";
import { day } from "../../../ui";
import { RequestForm } from "../RequestForm";

export const metadata: Metadata = { title: "New request" };

const KINDS: { kind: "support" | "equipment" | "account_change" | "trip"; label: string; sub: string; icon: LucideIcon }[] = [
  { kind: "support", label: "Question or problem", sub: "A deposit, a fee, a terminal acting up, anything.", icon: CircleHelp },
  { kind: "equipment", label: "Equipment and supplies", sub: "Paper rolls, a replacement or an extra terminal.", icon: Wrench },
  { kind: "account_change", label: "Account change", sub: "Bank account, address, contact details, a new location.", icon: UserCog },
  { kind: "trip", label: "Plan a trip", sub: "Hotel stays planned by your account manager.", icon: Plane },
];

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ kind?: string; chargeback?: string; subject?: string; what?: string }> }) {
  const u = await requirePortalUser();
  const sp = await searchParams;
  const cb = sp.kind === "dispute" && sp.chargeback ? await getOwnChargeback(u, sp.chargeback) : null;
  const kind = cb ? "dispute" : (KINDS.find((k) => k.kind === sp.kind)?.kind ?? null);
  const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, u.merchantId), columns: { street: true, city: true, state: true, zip: true } });
  const shipTo = m ? [m.street, [m.city, m.state].filter(Boolean).join(", "), m.zip].filter(Boolean).join(", ") : "";

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>{kind === "dispute" ? <>Tell us about this <em>sale</em></> : <>What do you <em>need</em>?</>}</h1>
          <p>Your account manager gets this right away and replies here and by email.</p>
        </div>
      </div>

      {kind !== "dispute" && (
        <nav className="mp-kinds" aria-label="Kind of request">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <Link key={k.kind} className="mp-kind" href={`/requests/new?kind=${k.kind}`} aria-current={kind === k.kind ? "true" : undefined}>
                <span className="mp-ico request"><Icon aria-hidden="true" /></span>
                <span><b>{k.label}</b><span>{k.sub}</span></span>
              </Link>
            );
          })}
        </nav>
      )}

      {kind === "dispute" && !cb && <p className="mp-callout bad">We couldn&apos;t find that dispute on your account.</p>}
      {kind && (
        <section className="mp-card" aria-label="Request details">
          <RequestForm
            key={kind}
            kind={kind}
            chargeback={cb ? { id: cb.id, label: `${fmtUsd(cb.amount)}${cb.cardBrand ? ` on ${cb.cardBrand}` : ""}${cb.cardLast4 ? ` ••${cb.cardLast4}` : ""}, received ${day(cb.receivedAt)}${cb.respondBy ? `, respond by ${day(cb.respondBy, true)}` : ""}` } : undefined}
            defaults={{ subject: sp.subject?.slice(0, 140), what: sp.what?.slice(0, 80), shipTo }}
          />
        </section>
      )}
      {!kind && <p className="muted">Choose one above to continue. <ShieldAlert className="ic" aria-hidden="true" style={{ verticalAlign: "-3px", color: "var(--brick-500)" }} /> For a dispute, use the button on the <Link href="/disputes">Disputes</Link> page so we know which sale it is.</p>}
    </>
  );
}
