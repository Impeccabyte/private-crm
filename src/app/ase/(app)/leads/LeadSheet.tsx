import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, scopeOwnerIds } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { fmtDateTime, SOURCE_LABEL, usd } from "@/lib/format";
import { Sheet } from "@/components/list";
import { Download, Paperclip, ShieldAlert } from "lucide-react";
import { fmtBytes } from "@/lib/files";
import { ActionForm } from "@/components/forms";
import { convertLead, disqualifyLead, logLeadActivity } from "./actions";

export async function LeadSheet({ id, closeHref }: { id: string; closeHref: string }) {
  const user = await requireUser();
  const owners = await scopeOwnerIds(user);
  const lead = /^[0-9a-f-]{36}$/.test(id) ? await db.query.leads.findFirst({ where: eq(schema.leads.id, id) }) : null;
  if (!lead || (owners && (!lead.ownerId || !owners.includes(lead.ownerId)))) return <Sheet title="Lead not found" closeHref={closeHref}><p className="muted">It may have been removed or isn’t in your book.</p></Sheet>;
  const [acts, owner, deal, merchant, files] = await Promise.all([
    db.select({ a: schema.activities, who: schema.users.name }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.actorUserId, schema.users.id)).where(eq(schema.activities.leadId, id)).orderBy(desc(schema.activities.occurredAt)).limit(20),
    lead.ownerId ? db.query.users.findFirst({ where: eq(schema.users.id, lead.ownerId) }) : null,
    db.query.deals.findFirst({ where: eq(schema.deals.leadId, id) }),
    lead.merchantId ? db.query.merchants.findFirst({ where: eq(schema.merchants.id, lead.merchantId) }) : null,
    db.select().from(schema.files).where(eq(schema.files.leadId, id)).orderBy(desc(schema.files.createdAt)),
  ]);
  const total = lead.scoreFit + lead.scoreVolume + lead.scoreEngagement + lead.scoreSource;
  const canEdit = can(user.role, "leads.edit");
  return (
    <Sheet title={lead.businessName} sub={`${SOURCE_LABEL[lead.source]} lead · ${lead.status}`} closeHref={closeHref}
      footer={canEdit && lead.status === "open" ? <>
        <form action={disqualifyLead.bind(null, id)}><button className="btn danger" type="submit">Disqualify</button></form>
        {deal ? <Link className="btn pri" href="/ase/deals">Open deal</Link> : <form action={convertLead.bind(null, id)}><button className="btn pri" type="submit">Convert to deal</button></form>}
      </> : undefined}>
      <dl className="dl">
        <dt>Contact</dt><dd>{lead.contactName ?? "—"}</dd>
        <dt>Phone</dt><dd className="num">{lead.phone ?? "—"}</dd>
        <dt>Email</dt><dd>{lead.email ?? "—"}</dd>
        <dt>Website</dt><dd>{lead.website ?? "—"}</dd>
        <dt>Industry / MCC</dt><dd>{[lead.industry, lead.mcc].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>Est. volume</dt><dd>{usd(lead.estMonthlyVolume)} / month</dd>
        <dt>Current processor</dt><dd>{lead.currentProcessor ?? "—"}</dd>
        <dt>Owner</dt><dd>{owner?.name ?? "—"}</dd>
        {merchant && <><dt>Linked merchant</dt><dd><Link href={`/ase/merchants/${merchant.id}`}>{merchant.dbaName}</Link></dd></>}
      </dl>
      <div>
        <div className="sec-t">Lead score · {total} / 100</div>
        <div className="card">
          {[["Industry fit (MCC)", lead.scoreFit, 25], ["Estimated volume", lead.scoreVolume, 30], ["Engagement (logged activity)", lead.scoreEngagement, 25], ["Source quality", lead.scoreSource, 13]].map(([l, v, max]) => (
            <div className="ck" key={l as string}><span style={{ flex: 1 }}>{l}</span><span className="bar" style={{ width: 80 }}><i style={{ width: `${((v as number) / (max as number)) * 100}%` }} /></span><b className="num" style={{ width: 28, textAlign: "right" }}>{v}</b></div>
          ))}
        </div>
      </div>
      {files.length > 0 && (
        <div>
          <div className="sec-t">Attachments · {files.length}</div>
          <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {files.map((f) => {
              const ok = f.scanStatus === "clean" || f.scanStatus === "unscanned";
              const badge = { clean: <span className="tag" style={{ color: "var(--g-ink)" }}>Scanned · clean</span>, unscanned: <span className="tag">Not scanned</span>,
                pending: <span className="tag" style={{ color: "var(--b-ink)" }}>Scanning…</span>, infected: <span className="tag" style={{ color: "var(--r-ink)" }}>Blocked · virus found</span>,
                error: <span className="tag" style={{ color: "var(--a-ink)" }}>Couldn’t scan</span> }[f.scanStatus as "clean"] ?? null;
              return (
                <li key={f.id} className="ck">
                  {ok ? <Paperclip size={14} aria-hidden="true" className="subtle" /> : <ShieldAlert size={14} aria-hidden="true" className={f.scanStatus === "infected" ? "tx-red" : "subtle"} />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {ok ? <a href={`/api/files/${f.id}`} className="ellipsis" style={{ display: "block", fontWeight: 500 }} download>{f.originalName}</a>
                      : <span className="ellipsis" style={{ display: "block", fontWeight: 500, color: f.scanStatus === "infected" ? "var(--ink-3)" : undefined, textDecoration: f.scanStatus === "infected" ? "line-through" : undefined }}>{f.originalName}</span>}
                    <span className="subtle sm">{[f.fieldLabel, fmtBytes(f.size), fmtDateTime(f.createdAt)].filter(Boolean).join(" · ")}</span>
                    <span className="row" style={{ gap: 6, marginTop: 4 }}>{badge}{f.scanStatus === "infected" && f.scanResult && <span className="subtle sm mono">{f.scanResult}</span>}</span>
                  </span>
                  {ok && <a className="btn sm" href={`/api/files/${f.id}`} download aria-label={`Download ${f.originalName}`}><Download size={14} aria-hidden="true" /></a>}
                </li>
              );
            })}
          </ul>
          <p className="subtle sm" style={{ margin: "6px 0 0" }}>Virus-scanned and encrypted at rest. Downloads are recorded in the audit log.</p>
        </div>
      )}
      {canEdit && (
        <ActionForm action={logLeadActivity} submitLabel="Log" className="stack" resetOnOk>
          <input type="hidden" name="leadId" value={id} />
          <div className="row" style={{ gap: 8 }}>
            <select name="type" className="inp" aria-label="Activity type" style={{ width: 110 }}><option value="call">Call</option><option value="email">Email</option><option value="note">Note</option></select>
            <input name="body" className="inp" style={{ flex: 1 }} placeholder="What happened?" aria-label="Activity details" />
          </div>
        </ActionForm>
      )}
      <div>
        <div className="sec-t">Activity</div>
        {acts.length === 0 && <div className="subtle sm">No activity yet.</div>}
        <div className="tl">
          {acts.map(({ a, who }) => (
            <div className="ev" key={a.id}><span className="ico" style={{ fontSize: 11 }}>{a.type[0]!.toUpperCase()}</span>
              <div><div className="hd"><b>{a.title}</b><span className="muted">{who}</span><span className="when">{fmtDateTime(a.occurredAt)}</span></div>{a.body && <div className={`body ${a.internal ? "note-y" : ""}`} style={{ whiteSpace: "pre-line" }}>{a.body}</div>}</div></div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
