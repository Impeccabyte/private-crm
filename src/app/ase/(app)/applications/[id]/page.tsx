import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Check, Clock, FileText, Flag, X } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { SECTIONS, submitBlockers, type SectionState } from "@/lib/applications";
import { maskEin } from "@/lib/crypto";
import { daysSince, fmtDateTime, usd } from "@/lib/format";
import { Avatar, Card, Pill, Proc } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { addNote, addSigner } from "../actions";
import { AppActions, ConditionCheck, DocToggle, SectionEditor, SignatureActions, ChecksRefresh } from "./Client";

export const metadata = { title: "Boarding application" };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("applications.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const app = await db.query.applications.findFirst({ where: eq(schema.applications.id, id) });
  if (!app) notFound();
  const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, app.merchantId) });
  const owners = await scopeOwnerIds(user);
  if (!m || (owners && (!m.ownerId || !owners.includes(m.ownerId)))) notFound();

  const [le, history, checks, conds, signers, docs, notes, agent, spec, conn] = await Promise.all([
    m.legalEntityId ? db.query.legalEntities.findFirst({ where: eq(schema.legalEntities.id, m.legalEntityId) }) : null,
    db.select().from(schema.applicationStatusHistory).where(eq(schema.applicationStatusHistory.applicationId, id)).orderBy(asc(schema.applicationStatusHistory.at)),
    db.select().from(schema.applicationChecks).where(eq(schema.applicationChecks.applicationId, id)).orderBy(asc(schema.applicationChecks.name)),
    db.select().from(schema.applicationConditions).where(eq(schema.applicationConditions.applicationId, id)),
    db.select().from(schema.applicationSigners).where(eq(schema.applicationSigners.applicationId, id)),
    db.select().from(schema.applicationDocuments).where(eq(schema.applicationDocuments.applicationId, id)),
    db.select({ a: schema.activities, who: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.actorUserId, schema.users.id))
      .where(eq(schema.activities.applicationId, id)).orderBy(desc(schema.activities.occurredAt)).limit(50),
    m.ownerId ? db.query.users.findFirst({ where: eq(schema.users.id, m.ownerId) }) : null,
    app.specialistId ? db.query.users.findFirst({ where: eq(schema.users.id, app.specialistId) }) : null,
    app.connectionId ? db.query.processorConnections.findFirst({ where: eq(schema.processorConnections.id, app.connectionId) }) : null,
  ]);
  const sections = (app.sections ?? {}) as Record<string, SectionState>;
  const blockers = submitBlockers(app, docs, signers);
  const canEdit = can(user.role, "applications.edit");
  const at = (s: string) => history.filter((h) => h.status === s).at(-1)?.at;
  const order = ["New", "Pending", "Underwriting"] as const;
  const curIdx = order.indexOf(app.status as (typeof order)[number]);
  const decided = ["Approved", "Declined", "Cancelled"].includes(app.status);
  const noteRows = notes.filter((n) => n.a.type === "note");
  const passed = checks.filter((c) => c.status === "Passed").length, failed = checks.filter((c) => c.status === "Failed").length, pending = checks.filter((c) => c.status === "Pending").length;
  const ICK = { complete: ["cki ok", Check, "Complete", "sm tx-green"], partial: ["cki part", Clock, "In progress", "sm tx-amber"], missing: ["cki no", X, "Missing items", "sm tx-red"] } as const;

  return (
    <div className="content" style={{ gap: 16 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/ase/applications">Applications</Link><span aria-hidden="true">/</span><b aria-current="page">{app.number}</b></nav>
      <header className="row w" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row w" style={{ gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-.02em" }}>{m.dbaName}</h1>
            <Pill status={app.status} />{app.conditional && <Pill status="Conditional" />}<Pill status={app.signatureStatus} /><Proc />
          </div>
          <div className="row w muted" style={{ gap: 10 }}>
            <span className="mono">{app.number}</span><span aria-hidden="true">·</span><span>{le?.legalName ?? "—"}</span>
            {m.mcc && <><span aria-hidden="true">·</span><span>MCC <span className="mono">{m.mcc}</span></span></>}
            {agent && <><span aria-hidden="true">·</span><span className="who"><Avatar initials={initialsOf(agent.name)} color={agent.avatarColor} avatarKey={agent.avatarKey} />{agent.name}</span></>}
            {spec && <><span aria-hidden="true">·</span><span className="who"><Avatar initials={initialsOf(spec.name)} color={spec.avatarColor} avatarKey={spec.avatarKey} />{spec.name}, specialist</span></>}
          </div>
        </div>
        <div className="row w" style={{ gap: 8 }}>
          <Link className="btn" href={`/ase/merchants/${m.id}`}>Merchant record</Link>
          {canEdit && <AppActions appId={id} status={app.status} blockers={blockers} />}
        </div>
      </header>

      <section className="card card-b" aria-label="Status" style={{ padding: "18px 20px" }}>
        <ol className="stepper" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {order.map((s, i) => {
            const done = decided || i < curIdx, cur = !decided && i === curIdx;
            const when = at(s);
            return (
              <li key={s} className={`step ${done ? "done" : cur ? "cur" : ""}`} aria-current={cur ? "step" : undefined}>
                <span className="ln" aria-hidden="true" />
                <span className="dot">{done ? <Check size={12} aria-hidden="true" /> : cur ? <Clock size={12} aria-hidden="true" /> : null}</span>
                <span className="st">{s}</span>
                <span className="ts">{when ? (cur ? `Since ${fmtDateTime(when)}` : fmtDateTime(when)) : "Not started"}</span>
                {cur && <span className="ts">{daysSince(app.statusChangedAt)} days{(daysSince(app.statusChangedAt) ?? 0) > 5 ? " · over target" : ""}</span>}
              </li>
            );
          })}
          <li className="step" style={{ flex: 1.3, paddingRight: 0 }}>
            <span className="dot" style={decided ? { borderColor: app.status === "Approved" ? (app.conditional ? "var(--a-ink)" : "var(--g-ink)") : "var(--r-ink)", color: app.status === "Approved" ? (app.conditional ? "var(--a-ink)" : "var(--g-ink)") : "var(--r-ink)" } : undefined}>{decided ? (app.status === "Approved" ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />) : null}</span>
            <span className="st">Decision</span>
            <span className="row w" style={{ gap: 4 }}>
              {(["Approved", "Declined", "Cancelled"] as const).map((d) => app.status === d
                ? <Pill key={d} status={d === "Approved" && app.conditional ? "Conditional" : d} label={d === "Approved" && app.conditional ? "Approved · Conditional" : d} />
                : <span key={d} className="pill" style={{ border: "1px solid var(--line)", color: "var(--ink-3)" }}>{d}</span>)}
            </span>
            <span className="ts">{decided ? fmtDateTime(at(app.status) ?? app.statusChangedAt) : "Awaiting underwriting"}</span>
          </li>
        </ol>
      </section>

      <div className="g-main" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <div className="stack">
          <Card title="Completion checklist" actions={<div className="row" style={{ gap: 10, width: 220 }}><div className="prog" style={{ flex: 1 }}><i style={{ width: `${(SECTIONS.filter((x) => sections[x.key]?.state === "complete").length / SECTIONS.length) * 100}%` }} /></div><span className="sm muted num">{SECTIONS.filter((x) => sections[x.key]?.state === "complete").length} of {SECTIONS.length}</span></div>}>
            {SECTIONS.map((sec) => {
              const st = sections[sec.key]?.state ?? "missing";
              const [cls, Icon, label, lcls] = ICK[st];
              return (
                <div className="ck" key={sec.key} style={{ alignItems: "flex-start" }}>
                  <span className={cls} aria-label={label}><Icon size={12} aria-hidden="true" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row"><span className="t">{sec.label}</span><span className="sp" /><span className={lcls}>{label}</span></div>
                    <div className="d">{sections[sec.key]?.summary ?? "Not started"}</div>
                    {sec.key === "fees" && app.campaign && <div className="subtle sm" style={{ marginTop: 4 }}>Pricing campaign: {app.campaign}{app.estMonthlyVolume ? ` · est. ${usd(app.estMonthlyVolume)}/mo` : ""}</div>}
                    {sec.key === "business" && le?.einLast4 && <div className="subtle sm" style={{ marginTop: 4 }}>EIN {maskEin(le.einLast4)}</div>}
                    {sec.key === "documents" && docs.length > 0 && (
                      <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 8 }}>
                        {docs.map((d) => (
                          <div key={d.id} className="row" style={{ padding: "7px 10px", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
                            <FileText size={14} aria-hidden="true" className="subtle" /><span style={{ flex: 1 }}>{d.name}</span><span className="subtle">{d.required ? "Required" : "Optional"}</span>
                            <Pill status={d.uploaded ? "Uploaded" : "Missing"} />
                            {canEdit && <DocToggle appId={id} docId={d.id} uploaded={d.uploaded} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && sec.key !== "documents" && sec.key !== "signature" && <SectionEditor appId={id} sectionKey={sec.key} state={st} summary={sections[sec.key]?.summary ?? ""} />}
                </div>
              );
            })}
          </Card>

          <Card title={<>Notes <span className="ct">{noteRows.length}</span></>} actions={<span className="subtle sm">Internal · not visible to the merchant</span>} bodyClass="card-b stack">
            {noteRows.map((n) => (
              <div key={n.a.id} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <Avatar initials={n.who ? initialsOf(n.who) : "M"} color={n.color} avatarKey={n.photo} />
                <div style={{ flex: 1, minWidth: 0 }}><div className="row"><b style={{ fontWeight: 600 }}>{n.who ?? "Maverick"}</b><span className="subtle sm">{fmtDateTime(n.a.occurredAt)}</span></div><div style={{ marginTop: 2, whiteSpace: "pre-line" }}>{n.a.body}</div></div>
              </div>
            ))}
            {noteRows.length === 0 && <div className="subtle sm">No notes yet.</div>}
            {canEdit && (
              <ActionForm action={addNote} submitLabel="Add note" className="stack" resetOnOk>
                <input type="hidden" name="appId" value={id} />
                <div className="composer int"><label className="sr" htmlFor="appnote">Add a note</label><textarea id="appnote" name="body" placeholder="Add a note for the boarding team…" style={{ minHeight: 64 }} /></div>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Signature" actions={<Pill status={app.signatureStatus} />}>
            {signers.length === 0 && <div className="card-b subtle sm">No signers yet. Add the principals who must sign.</div>}
            {signers.map((s) => (
              <div className="ck" key={s.id}>
                <Avatar initials={initialsOf(s.name)} color="av-3" size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}><div className="t">{s.name}</div><div className="d">{[s.role, s.ownershipPct ? `${s.ownershipPct}%` : null].filter(Boolean).join(" · ")}</div><div className="d">{s.signedAt ? `Signed ${fmtDateTime(s.signedAt)}` : s.lastEvent}</div></div>
                <Pill status={s.status} />
              </div>
            ))}
            {canEdit && (
              <div className="card-b stack" style={{ borderTop: "1px solid var(--line)", gap: 8 }}>
                <SignatureActions appId={id} signed={app.signatureStatus === "Signed"} />
                <details>
                  <summary className="lnk">+ Add a signer</summary>
                  <ActionForm action={addSigner} submitLabel="Add signer" className="stack" resetOnOk>
                    <input type="hidden" name="appId" value={id} />
                    <div className="form-grid"><input name="name" className="inp" placeholder="Full name" aria-label="Signer name" /><input name="email" type="email" className="inp" placeholder="Email" aria-label="Signer email" />
                      <input name="role" className="inp" placeholder="Owner · Signer, Guarantor" aria-label="Role" /><input name="ownershipPct" type="number" className="inp" placeholder="Ownership %" aria-label="Ownership percent" /></div>
                  </ActionForm>
                </details>
              </div>
            )}
          </Card>

          <Card title="Underwriting checks" actions={canEdit && conn ? <ChecksRefresh appId={id} /> : undefined}>
            <div className="row" style={{ padding: "8px 16px", gap: 12, borderBottom: "1px solid var(--line)", fontSize: 12 }}>
              <span className="tx-green"><b className="num">{passed}</b> passed</span><span className="tx-red"><b className="num">{failed}</b> failed</span><span className="tx-blue"><b className="num">{pending}</b> pending</span>
              <span className="sp" /><span className="subtle">{checks[0] ? `Updated ${fmtDateTime(checks[0].checkedAt)}` : "Not run yet"}</span>
            </div>
            {checks.length === 0 && <div className="card-b subtle sm">Checks run automatically at the processor after submission.</div>}
            {checks.map((c) => (
              <div className="ck" key={c.id} style={{ alignItems: "flex-start" }}>
                <Pill status={c.status} />
                <div style={{ flex: 1, minWidth: 0 }}><div className="t">{c.name}</div>{c.detail && <div className={`d ${c.status === "Failed" ? "tx-red" : ""}`}>{c.detail}</div>}</div>
              </div>
            ))}
          </Card>

          {(app.conditional || conds.length > 0) && (
            <section className="card" style={{ borderColor: "color-mix(in srgb, var(--a-ink) 35%, var(--line))" }}>
              <div className="card-h" style={{ background: "var(--a-bg)", borderRadius: "10px 10px 0 0" }}><h2 style={{ color: "var(--a-ink)" }}><Flag size={14} aria-hidden="true" />Approval conditions</h2><span className="sm" style={{ color: "var(--a-ink)" }}>{conds.filter((c) => c.met).length} of {conds.length} met</span></div>
              {conds.map((c) => (
                <div className="ck" key={c.id}>
                  {canEdit ? <ConditionCheck appId={id} condId={c.id} met={c.met} label={c.content} /> : null}
                  <div style={{ flex: 1 }}><div className="t">{c.content}</div>{c.detail && <div className="d">{c.detail}</div>}</div>
                  <Pill status={c.met ? "Passed" : "Pending"} label={c.met ? "Met" : "Open"} />
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
