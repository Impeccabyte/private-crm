import Link from "next/link";
import { hideEligibility } from "@/lib/merchant-hide";
import { HideMerchantButton, UnhideButton } from "./HideMerchant";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, inArray, ne, sql as dsql } from "drizzle-orm";
import { Building2, CreditCard, EyeOff, FileText, Mail, MessageCircle, Phone, StickyNote, CheckSquare, Store, Terminal as TerminalIcon } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { maskAccount, maskEin } from "@/lib/crypto";
import { volumeBetween, volumeByMonth, monthStart, pctChange } from "@/lib/metrics";
import { daysUntil, fmtDate, fmtDateTime, MERCHANT_STATUS_LABEL, num, relTime, signedPct, usd } from "@/lib/format";
import { Avatar, Card, Empty, Pill, Proc, Tabs } from "@/components/ui";
import { Bars } from "@/components/charts";
import { Reveal } from "./Reveal";
import { LogSheet } from "./LogSheet";
import { LocationSwitcher } from "./LocationSwitcher";
import { OwnerSelect } from "./OwnerSelect";
import { assignableOwners } from "@/lib/owners";
import { PortalAccess } from "./PortalAccess";

export const metadata = { title: "Merchant" };

const TABS = ["overview", "activity", "mids", "applications", "tickets", "chargebacks", "payouts", "residuals", "documents", "contacts"] as const;
type Tab = (typeof TABS)[number];

export default async function MerchantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("merchants.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const owners = await scopeOwnerIds(user);
  const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, id) });
  if (!m || (owners && (!m.ownerId || !owners.includes(m.ownerId)))) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";

  const [le, owner, accounts, contacts, siblings] = await Promise.all([
    m.legalEntityId ? db.query.legalEntities.findFirst({ where: eq(schema.legalEntities.id, m.legalEntityId) }) : null,
    m.ownerId ? db.query.users.findFirst({ where: eq(schema.users.id, m.ownerId) }) : null,
    db.select().from(schema.merchantAccounts).where(eq(schema.merchantAccounts.merchantId, id)).orderBy(asc(schema.merchantAccounts.createdAt)),
    db.select().from(schema.contacts).where(eq(schema.contacts.merchantId, id)).orderBy(desc(schema.contacts.ownershipPct)),
    m.legalEntityId ? db.select({ id: schema.merchants.id, dbaName: schema.merchants.dbaName, status: schema.merchants.status, city: schema.merchants.city, street: schema.merchants.street })
      .from(schema.merchants).where(eq(schema.merchants.legalEntityId, m.legalEntityId)).orderBy(asc(schema.merchants.createdAt)) : [],
  ]);
  const acctIds = accounts.map((a) => a.id);
  const now = new Date();
  const d30 = new Date(Date.now() - 30 * 86_400_000), d60 = new Date(Date.now() - 60 * 86_400_000), d90 = new Date(Date.now() - 90 * 86_400_000);
  const scopeThis = eq(schema.merchants.id, id);
  const [v30, vPrev, v90, cb90, lastPayout, resLast, counts] = await Promise.all([
    volumeBetweenMerchant(id, d30, now), volumeBetweenMerchant(id, d60, d30), volumeBetweenMerchant(id, d90, now),
    db.select({ n: dsql<number>`count(*)::int` }).from(schema.chargebacks).where(and(eq(schema.chargebacks.merchantId, id), gte(schema.chargebacks.receivedAt, d90.toISOString().slice(0, 10)))),
    acctIds.length ? db.select().from(schema.payouts).where(inArray(schema.payouts.merchantAccountId, acctIds)).orderBy(desc(schema.payouts.depositDate)).limit(1) : [],
    acctIds.length ? db.select({ p: dsql<number>`coalesce(sum(${schema.residualLines.profit}),0)::float` }).from(schema.residualLines)
      .where(and(inArray(schema.residualLines.merchantAccountId, acctIds), eq(schema.residualLines.period, monthStart(now, -1).toISOString().slice(0, 10)))) : [{ p: 0 }],
    db.select({
      activity: dsql<number>`(select count(*)::int from activities where merchant_id = ${id})`,
      apps: dsql<number>`(select count(*)::int from applications where merchant_id = ${id})`,
      tickets: dsql<number>`(select count(*)::int from tickets where merchant_id = ${id})`,
      cbs: dsql<number>`(select count(*)::int from chargebacks where merchant_id = ${id})`,
      terms: dsql<number>`(select count(*)::int from terminals t join merchant_accounts ma on ma.id = t.merchant_account_id where ma.merchant_id = ${id})`,
      docs: dsql<number>`(select count(*)::int from application_documents d join applications a on a.id = d.application_id where a.merchant_id = ${id})`,
    }).from(dsql`(select 1) x`),
  ]);
  const c = counts[0]!;
  const vDelta = pctChange(v30.amount, vPrev.amount);
  const cbRatio = v90.count ? (cb90[0]!.n / v90.count) * 100 : null;
  const lp = lastPayout[0];
  const canEdit = can(user.role, "merchants.edit");
  const canReveal = can(user.role, "sensitive.reveal");
  const portalUsers = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.merchantId, id)).orderBy(asc(schema.portalUsers.createdAt));
  const base = `/merchants/${id}`;
  const ownerOptions = !owners && canEdit ? await assignableOwners() : null;
  void scopeThis;
  const canHide = can(user.role, "merchants.hide");
  const hideable = canHide && !m.hiddenAt && m.status === "boarding" ? await hideEligibility(id) : null;
  const hiddenBy = m.hiddenAt && m.hiddenById ? await db.query.users.findFirst({ where: eq(schema.users.id, m.hiddenById), columns: { name: true } }) : null;

  return (
    <div className="content" style={{ gap: 16 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/merchants">Merchants</Link><span aria-hidden="true">/</span><b aria-current="page">{m.dbaName}</b></nav>

      {m.hiddenAt && (
        <div className="banner blue" role="status" style={{ alignItems: "center" }}>
          <EyeOff size={16} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bt">This merchant is hidden</div>
            <div className="bd sm">Hidden {fmtDate(m.hiddenAt)}{hiddenBy ? ` by ${hiddenBy.name}` : ""}. It doesn’t appear in lists, search, pickers or exports. It comes back automatically if Maverick reopens its application.</div>
          </div>
          {canHide && <UnhideButton merchantId={id} />}
        </div>
      )}

      <header className="row w" style={{ alignItems: "flex-start", gap: 14 }}>
        <span style={{ width: 48, height: 48, borderRadius: 10, background: "var(--sunken)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--ink-2)", flex: "none" }}><Store size={22} aria-hidden="true" /></span>
        <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row w" style={{ gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-.02em" }}>{m.dbaName}</h1>
            <Pill status={MERCHANT_STATUS_LABEL[m.status]!} />
            {accounts.length === 0 && <span className="proc" style={{ borderStyle: "dashed", color: "var(--ink-3)" }}>No MID yet</span>}
            {accounts.map((a) => <span key={a.id} title={`MID ${a.mid}`}><Proc name={a.processor === "maverick" ? "Maverick" : a.processor} suffix={a.channel === "Card not present" ? "e-com" : undefined} /></span>)}
          </div>
          <div className="row w muted" style={{ gap: 10 }}>
            <span>{le?.legalName ?? "No legal entity"}</span>
            {siblings.length > 1 && <LocationSwitcher current={id} ein={maskEin(le?.einLast4)} locations={siblings.map((s) => ({ id: s.id, name: s.dbaName, sub: [s.street, s.city].filter(Boolean).join(", "), status: MERCHANT_STATUS_LABEL[s.status]! }))} />}
            {m.mcc && <><span aria-hidden="true">·</span><span>MCC <span className="mono">{m.mcc}</span> {m.industry}</span></>}
            <span aria-hidden="true">·</span>
            {ownerOptions ? <OwnerSelect merchantId={id} current={owner ? { id: owner.id, name: owner.name, active: owner.status === "active" } : null} options={ownerOptions} /> : owner ? <span className="who"><Avatar initials={initialsOf(owner.name)} color={owner.avatarColor} avatarKey={owner.avatarKey} />{owner.name}</span> : <span>Unassigned</span>}
            {m.liveSince && <><span aria-hidden="true">·</span><span>Live since {fmtDate(m.liveSince)}</span></>}
          </div>
        </div>
        {canEdit && (
          <div className="row w" style={{ gap: 6 }}>
            <Link className="btn" href={`${base}?tab=${tab}&log=call`} scroll={false}><Phone size={14} aria-hidden="true" />Log call</Link>
            <Link className="btn" href={`${base}?tab=${tab}&log=email`} scroll={false}><Mail size={14} aria-hidden="true" />Email</Link>
            <Link className="btn" href={`${base}?tab=${tab}&log=note`} scroll={false}><StickyNote size={14} aria-hidden="true" />Note</Link>
            {can(user.role, "tickets.edit") && <Link className="btn" href={`/support?new=1&merchant=${id}`}><MessageCircle size={14} aria-hidden="true" />New ticket</Link>}
            <Link className="btn" href={`${base}?tab=${tab}&log=task`} scroll={false}><CheckSquare size={14} aria-hidden="true" />New task</Link>
            {hideable?.ok && <HideMerchantButton merchantId={id} dbaName={m.dbaName} />}
          </div>
        )}
        {!canEdit && hideable?.ok && <HideMerchantButton merchantId={id} dbaName={m.dbaName} />}
      </header>

      <section className="hs" aria-label="Highlights">
        <div><span className="l">30-day volume</span><span className="v">{accounts.length ? usd(v30.amount) : "—"}</span><span className="s"><span className={vDelta === null ? "" : vDelta >= 0 ? "tx-green" : "tx-red"}>{vDelta === null ? "No prior data" : `${signedPct(vDelta)} vs prior 30`}</span></span></div>
        <div><span className="l">Transactions</span><span className="v">{accounts.length ? num(v30.count) : "—"}</span><span className="s">Last 30 days</span></div>
        <div><span className="l">Average ticket</span><span className="v">{v30.count ? usd(v30.amount / v30.count) : "—"}</span><span className="s">Last 30 days</span></div>
        <div><span className="l">Chargeback ratio</span><span className={`v ${cbRatio !== null && cbRatio >= 0.65 ? "tx-red" : ""}`}>{cbRatio === null ? "—" : `${cbRatio.toFixed(2)}%`}</span><span className="s">{cb90[0]!.n} of {num(v90.count)} · 90 days</span></div>
        <div><span className="l">Last payout</span><span className="v">{lp ? usd(lp.net) : "—"}</span><span className="s">{lp ? fmtDate(lp.depositDate) : "No payouts yet"}</span></div>
        <div><span className="l">Reserve balance</span><span className="v">{m.reserveBalance != null ? usd(m.reserveBalance) : "—"}</span><span className="s">{m.reserveTarget ? `Target ${usd(m.reserveTarget)}` : "No reserve"}</span></div>
        <div><span className="l">Residual · last month</span><span className="v">{accounts.length ? usd(resLast[0]?.p ?? 0) : "—"}</span><span className="s">{monthStart(now, -1).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}</span></div>
      </section>

      <Tabs active={tab} base={base} tabs={[
        { key: "overview", label: "Overview" }, { key: "activity", label: "Activity", count: c.activity }, { key: "mids", label: "MIDs & Terminals", count: accounts.length + c.terms },
        { key: "applications", label: "Applications", count: c.apps }, { key: "tickets", label: "Tickets", count: c.tickets }, { key: "chargebacks", label: "Chargebacks", count: c.cbs },
        { key: "payouts", label: "Payouts & Batches" }, ...(can(user.role, "residuals.view") ? [{ key: "residuals", label: "Residuals" }] : []), { key: "documents", label: "Documents", count: c.docs }, { key: "contacts", label: "Contacts", count: contacts.length },
      ]} />

      <div className="g-main">
        <section className="card" style={{ minWidth: 0 }} role="tabpanel">
          {tab === "overview" && <Overview id={id} accounts={accounts.length} status={m.status} />}
          {tab === "activity" && <Activity id={id} filter={sp.af} base={base} />}
          {tab === "mids" && <Mids accounts={accounts} canReveal={canReveal} />}
          {tab === "applications" && <Applications id={id} />}
          {tab === "tickets" && <Tickets id={id} />}
          {tab === "chargebacks" && <Chargebacks id={id} />}
          {tab === "payouts" && <Payouts acctIds={acctIds} />}
          {tab === "residuals" && <Residuals acctIds={acctIds} />}
          {tab === "documents" && <Documents id={id} />}
          {tab === "contacts" && <Contacts contacts={contacts} />}
        </section>

        <aside className="stack" aria-label="Merchant details">
          <Card title="Legal entity" bodyClass="card-b stack">
            <dl className="dl">
              <dt>Legal name</dt><dd>{le?.legalName ?? "—"}</dd>
              <dt>Entity type</dt><dd>{[le?.entityType, le?.stateOfFormation].filter(Boolean).join(" · ") || "—"}</dd>
              <dt>EIN</dt><dd>{le?.einLast4 ? <Reveal kind="ein" id={le.id} masked={maskEin(le.einLast4)} allowed={canReveal} /> : "—"}</dd>
            </dl>
            {siblings.length > 1 && (
              <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                <div className="row" style={{ padding: "8px 10px", background: "var(--sunken)", fontSize: 12, fontWeight: 500 }}><Building2 size={14} aria-hidden="true" />{siblings.length} locations under this EIN</div>
                {siblings.map((s) => (
                  <Link key={s.id} href={`/merchants/${s.id}`} className="row" aria-current={s.id === id ? "page" : undefined} style={{ padding: "7px 10px", borderTop: "1px solid var(--line)", textDecoration: "none", color: "var(--ink)", fontSize: 12, background: s.id === id ? "var(--accent-soft)" : undefined }}>
                    <span className="ellipsis" style={{ flex: 1 }}>{s.dbaName}</span><Pill status={MERCHANT_STATUS_LABEL[s.status]!} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card title="Addresses & service" bodyClass="card-b">
            <dl className="dl">
              <dt>Location</dt><dd>{m.street ? <>{m.street}<br />{m.city}, {m.state} {m.zip}</> : "—"}</dd>
              <dt>Mailing</dt><dd>{m.mailingAddress ?? "Same as location"}</dd>
              <dt>CS phone</dt><dd className="num">{m.csPhone ? <a href={`tel:${m.csPhone}`} style={{ textDecoration: "none" }}>{m.csPhone}</a> : "—"}</dd>
              <dt>CS email</dt><dd>{m.csEmail ? <a href={`mailto:${m.csEmail}`} style={{ textDecoration: "none" }}>{m.csEmail}</a> : "—"}</dd>
              <dt>Website</dt><dd className="ellipsis">{m.website ?? "—"}</dd>
            </dl>
          </Card>
          <Card title="Principals" actions={<span className="subtle sm">{contacts.reduce((a, x) => a + (x.ownershipPct ?? 0), 0)}% listed</span>}>
            {contacts.filter((x) => x.ownershipPct || x.labels.includes("Owner")).length === 0 && <div className="card-b subtle">No principals recorded.</div>}
            {contacts.filter((x) => x.ownershipPct || x.labels.includes("Owner")).map((p) => (
              <div className="ck" key={p.id}>
                <Avatar initials={initialsOf(`${p.firstName} ${p.lastName}`)} color="av-5" size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}><div className="t">{p.firstName} {p.lastName}</div><div className="d">{[p.title, p.ownershipPct ? `${p.ownershipPct}%` : null].filter(Boolean).join(" · ")}</div></div>
                <span className="row" style={{ gap: 4 }}>{p.labels.filter((l) => ["Signer", "Guarantor"].includes(l)).map((l) => <span key={l} className="tag">{l}</span>)}</span>
              </div>
            ))}
          </Card>
          <Card title="Merchant portal">
            <PortalAccess merchantId={id} canEdit={canEdit && !m.hiddenAt} users={portalUsers.map((p) => ({ id: p.id, name: p.name, email: p.email, status: p.status, lastLoginAt: p.lastLoginAt?.toISOString() ?? null }))}
              suggest={(() => { const c = contacts.find((x) => x.email && x.labels.includes("Primary")) ?? contacts.find((x) => x.email); return c ? { name: `${c.firstName} ${c.lastName}`, email: c.email! } : null; })()} />
          </Card>
          <Card title="Bank account">
            {accounts.filter((a) => a.bankAccountLast4).length === 0 && <div className="card-b subtle">No bank account on file.</div>}
            {accounts.filter((a) => a.bankAccountLast4).map((a) => (
              <div className="card-b" key={a.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <dl className="dl">
                  <dt>Bank</dt><dd>{a.bankName ?? "—"}</dd>
                  <dt>Account</dt><dd><Reveal kind="bank" id={a.id} masked={`Checking ${maskAccount(a.bankAccountLast4)}`} allowed={canReveal} /></dd>
                  <dt>Routing</dt><dd className="mask">{a.routingLast4 ? `•••••${a.routingLast4}` : "—"}</dd>
                  <dt>For MID</dt><dd className="mono">••{a.mid.slice(-4)}</dd>
                </dl>
              </div>
            ))}
          </Card>
        </aside>
      </div>
      {sp.log && canEdit && <LogSheet merchantId={id} kind={sp.log} closeHref={`${base}?tab=${tab}`} />}
    </div>
  );
}

async function volumeBetweenMerchant(merchantId: string, from: Date, to: Date) {
  const [r] = await db.select({ amt: dsql<number>`coalesce(sum(${schema.dailyMetrics.salesAmount}),0)::float`, cnt: dsql<number>`coalesce(sum(${schema.dailyMetrics.salesCount}),0)::int` })
    .from(schema.dailyMetrics).innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id))
    .where(and(eq(schema.merchantAccounts.merchantId, merchantId), gte(schema.dailyMetrics.day, from.toISOString().slice(0, 10)), dsql`${schema.dailyMetrics.day} < ${to.toISOString().slice(0, 10)}`));
  return { amount: r?.amt ?? 0, count: r?.cnt ?? 0 };
}
void volumeBetween;

// ── Tabs ──────────────────────────────────────────────────────────────────────
async function Overview({ id, accounts, status }: { id: string; accounts: number; status: string }) {
  const [months, openTickets, openCbs, openApps, recent] = await Promise.all([
    volumeByMonth(null, 12, eq(schema.merchants.id, id)),
    db.select().from(schema.tickets).where(and(eq(schema.tickets.merchantId, id), ne(schema.tickets.status, "Closed"))).limit(3),
    db.select().from(schema.chargebacks).where(and(eq(schema.chargebacks.merchantId, id), eq(schema.chargebacks.status, "Processed"))).limit(3),
    db.select().from(schema.applications).where(and(eq(schema.applications.merchantId, id), inArray(schema.applications.status, ["New", "Pending", "Underwriting"]))).limit(3),
    db.select({ a: schema.activities, actor: schema.users.name }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.actorUserId, schema.users.id))
      .where(eq(schema.activities.merchantId, id)).orderBy(desc(schema.activities.occurredAt)).limit(5),
  ]);
  const hasVolume = months.some((x) => x.amount > 0);
  return (
    <div className="card-b stack" style={{ gap: 18 }}>
      {!accounts && status !== "closed" && (
        <Empty icon={CreditCard} title="No processing data yet" actions={<Link className="btn pri" href={`/applications/new?merchant=${id}`}>Start boarding application</Link>}>
          Volume, payouts, chargebacks and residuals show up here once a MID goes live with a processor.
        </Empty>
      )}
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)" }}>
        {hasVolume && <div><div className="sec-t">Monthly volume</div><Bars data={months.slice(-6).map((x) => ({ label: x.label, volume: x.amount }))} series={[{ key: "volume", label: "Volume" }]} height={200} /></div>}
        <div className="stack" style={{ gap: 8 }}>
          <div className="sec-t" style={{ margin: 0 }}>Open items</div>
          {openTickets.length + openCbs.length + openApps.length === 0 && <div className="subtle sm">Nothing open.</div>}
          {openTickets.map((t) => (
            <Link key={t.id} className="att" href={`/support?t=${t.id}`} style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
              <span className="ai t-blue"><MessageCircle size={14} aria-hidden="true" /></span>
              <span style={{ minWidth: 0 }}><span className="t1" style={{ display: "block" }}>{t.number} · {t.subject}</span><span className="t2" style={{ display: "block" }}>{t.source === "maverick" ? "Maverick" : "Internal"} · {t.status}</span></span>
              <Pill status={t.status} />
            </Link>
          ))}
          {openCbs.map((cb) => { const d = daysUntil(cb.respondBy); return (
            <Link key={cb.id} className="att" href={`/chargebacks?cb=${cb.id}`} style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
              <span className="ai t-red"><CreditCard size={14} aria-hidden="true" /></span>
              <span style={{ minWidth: 0 }}><span className="t1" style={{ display: "block" }}>{cb.caseId} · {usd(cb.amount)} · {cb.reason}</span><span className="t2" style={{ display: "block" }}>Respond by {fmtDate(cb.respondBy)}{d !== null ? ` · ${d} day${d === 1 ? "" : "s"} left` : ""}</span></span>
              <Pill status={cb.status} />
            </Link>
          ); })}
          {openApps.map((a) => (
            <Link key={a.id} className="att" href={`/applications/${a.id}`} style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
              <span className="ai t-amber"><FileText size={14} aria-hidden="true" /></span>
              <span style={{ minWidth: 0 }}><span className="t1" style={{ display: "block" }}>{a.number} · {a.forLabel ?? "Boarding application"}</span><span className="t2" style={{ display: "block" }}>{a.status} since {fmtDate(a.statusChangedAt)}</span></span>
              <Pill status={a.status} />
            </Link>
          ))}
        </div>
      </div>
      <hr className="divider" />
      <div>
        <div className="row" style={{ marginBottom: 10 }}><div className="sec-t" style={{ margin: 0 }}>Recent activity</div><span className="sp" /><Link className="lnk" href={`/merchants/${id}?tab=activity`}>View all activity</Link></div>
        <Timeline items={recent} />
      </div>
    </div>
  );
}

function Timeline({ items }: { items: { a: typeof schema.activities.$inferSelect; actor: string | null }[] }) {
  if (!items.length) return <div className="subtle sm">No activity yet.</div>;
  const ICON = { call: Phone, email: Mail, note: StickyNote, task: CheckSquare, meeting: CheckSquare, system: FileText };
  return (
    <div className="tl" role="feed" aria-label="Activity timeline">
      {items.map(({ a, actor }) => {
        const sys = a.type === "system";
        const Icon = ICON[a.type];
        return (
          <article key={a.id} className={`ev ${sys ? "sys" : ""}`}>
            <span className="ico" title={sys ? "Processor event" : a.type}>
              {sys ? <span className="pm" style={{ width: 12, height: 12, fontSize: 8, lineHeight: "12px" }} aria-label={a.source === "maverick" ? "Maverick" : "System"}>{a.source === "maverick" ? "M" : "•"}</span> : <Icon size={14} aria-hidden="true" />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="hd"><b>{a.title}</b><span className="muted">{sys ? (a.source === "maverick" ? "via Maverick" : "") : actor}</span>{a.tag && <span className="tag">{a.tag}</span>}<span className="when" title={fmtDateTime(a.occurredAt)}>{fmtDateTime(a.occurredAt)}</span></div>
              {a.body && <div className={`body ${a.internal ? "note-y" : ""}`} style={{ whiteSpace: "pre-line" }}>{a.body}</div>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Activity({ id, filter, base }: { id: string; filter?: string; base: string }) {
  const types = ["call", "email", "note", "task", "system"] as const;
  const f = types.find((t) => t === filter);
  const [items, counts] = await Promise.all([
    db.select({ a: schema.activities, actor: schema.users.name }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.actorUserId, schema.users.id))
      .where(and(eq(schema.activities.merchantId, id), f ? eq(schema.activities.type, f) : undefined)).orderBy(desc(schema.activities.occurredAt)).limit(100),
    db.select({ type: schema.activities.type, n: dsql<number>`count(*)::int` }).from(schema.activities).where(eq(schema.activities.merchantId, id)).groupBy(schema.activities.type),
  ]);
  const total = counts.reduce((a, x) => a + x.n, 0);
  const label = { call: "Calls", email: "Emails", note: "Notes", task: "Tasks", system: "System" };
  return (
    <div className="card-b stack" style={{ gap: 14 }}>
      <div className="row w">
        <div className="seg" role="group" aria-label="Filter activity">
          <Link href={`${base}?tab=activity`} className={`btn ghost sm ${!f ? "" : ""}`} style={!f ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(16,24,40,.12)" } : undefined} aria-current={!f}>All <span className="subtle">{total}</span></Link>
          {types.map((t) => (
            <Link key={t} href={`${base}?tab=activity&af=${t}`} className="btn ghost sm" style={f === t ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(16,24,40,.12)" } : undefined} aria-current={f === t}>{label[t]} <span className="subtle">{counts.find((x) => x.type === t)?.n ?? 0}</span></Link>
          ))}
        </div>
        <span className="sp" />
        <Link className="btn sm" href={`${base}?tab=activity&log=note`} scroll={false}><StickyNote size={14} aria-hidden="true" />Add note</Link>
      </div>
      <Timeline items={items} />
    </div>
  );
}

async function Mids({ accounts, canReveal }: { accounts: (typeof schema.merchantAccounts.$inferSelect)[]; canReveal: boolean }) {
  if (!accounts.length) return <Empty icon={TerminalIcon} title="No MIDs yet">A MID appears here when the processor creates the merchant account (webhook “Acquirer Merchant Account Created” or the next sync).</Empty>;
  const terms = await db.select().from(schema.terminals).where(inArray(schema.terminals.merchantAccountId, accounts.map((a) => a.id))).orderBy(asc(schema.terminals.tid));
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const vols = await db.select({ id: schema.dailyMetrics.merchantAccountId, amt: dsql<number>`sum(${schema.dailyMetrics.salesAmount})::float` }).from(schema.dailyMetrics)
    .where(and(inArray(schema.dailyMetrics.merchantAccountId, accounts.map((a) => a.id)), gte(schema.dailyMetrics.day, d30))).groupBy(schema.dailyMetrics.merchantAccountId);
  void canReveal;
  return (
    <>
      <div className="lt"><span className="muted sm">{accounts.length} MID{accounts.length === 1 ? "" : "s"} · {terms.length} terminal{terms.length === 1 ? "" : "s"} · grouped by MID</span></div>
      <div className="tblw">
        <table className="tbl">
          <thead><tr><th>MID / TID</th><th>Processor</th><th>Type</th><th>Status</th><th>Model</th><th>Location</th><th className="r">30-day volume</th><th>Last batch / opened</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <FragmentRows key={a.id} a={a} vol={vols.find((v) => v.id === a.id)?.amt ?? 0} terms={terms.filter((t) => t.merchantAccountId === a.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="lfoot"><span>A DBA can hold MIDs from more than one processor. Each MID shows its own processor badge.</span></div>
    </>
  );
}

function FragmentRows({ a, vol, terms }: { a: typeof schema.merchantAccounts.$inferSelect; vol: number; terms: (typeof schema.terminals.$inferSelect)[] }) {
  return (
    <>
      <tr className="grp2">
        <td><span className="row" style={{ gap: 6 }}><span className="subtle sm">MID</span><span className="mono">{a.mid}</span></span></td>
        <td><Proc name={a.processor === "maverick" ? "Maverick" : a.processor} /></td><td className="muted">{a.channel}</td>
        <td><Pill status={a.status === "Live" ? "Live" : a.status} /></td><td className="muted">{terms.length} terminal{terms.length === 1 ? "" : "s"}</td><td className="muted">{a.riskLevel ?? ""}</td>
        <td className="r">{vol ? usd(vol) : "—"}</td><td className="muted">{a.openedAt ? `Opened ${fmtDate(a.openedAt)}` : "—"}{a.closedAt ? ` · closed ${fmtDate(a.closedAt)}` : ""}</td>
      </tr>
      {terms.map((t) => (
        <tr key={t.id}>
          <td><span className="row" style={{ gap: 6, paddingLeft: 18 }}><TerminalIcon size={14} aria-hidden="true" className="subtle" /><span className="subtle sm">TID</span><span className="mono">{t.tid}</span></span></td>
          <td /><td className="muted">{t.name ?? "Terminal"}</td><td><Pill status={t.status} /></td><td className="muted">{t.model ?? "—"}</td><td className="muted">{t.location ?? "—"}</td><td className="r" /><td className="muted">{t.lastBatchAt ? fmtDateTime(t.lastBatchAt) : "—"}</td>
        </tr>
      ))}
    </>
  );
}

async function Applications({ id }: { id: string }) {
  const apps = await db.select({ a: schema.applications, spec: schema.users.name }).from(schema.applications).leftJoin(schema.users, eq(schema.applications.specialistId, schema.users.id))
    .where(eq(schema.applications.merchantId, id)).orderBy(desc(schema.applications.createdAt));
  if (!apps.length) return <Empty icon={FileText} title="No applications" actions={<Link className="btn pri" href={`/applications/new?merchant=${id}`}>Start boarding application</Link>}>Start an application to board this merchant with a processor.</Empty>;
  return (
    <div className="tblw"><table className="tbl">
      <thead><tr><th>Application</th><th>For</th><th>Status</th><th>Signature</th><th>Created</th><th>Last change</th><th>Specialist</th></tr></thead>
      <tbody>{apps.map(({ a, spec }) => (
        <tr key={a.id}><td><Link className="rl mono" href={`/applications/${a.id}`}>{a.number}</Link></td><td>{a.forLabel ?? "—"}</td>
          <td><span className="row" style={{ gap: 4 }}><Pill status={a.status} />{a.conditional && <Pill status="Conditional" />}</span></td><td><Pill status={a.signatureStatus} /></td>
          <td className="muted">{fmtDate(a.createdAt)}</td><td className="muted">{fmtDate(a.statusChangedAt)}</td><td>{spec ?? "—"}</td></tr>
      ))}</tbody>
    </table></div>
  );
}

async function Tickets({ id }: { id: string }) {
  const rows = await db.select({ t: schema.tickets, who: schema.users.name }).from(schema.tickets).leftJoin(schema.users, eq(schema.tickets.assigneeId, schema.users.id))
    .where(eq(schema.tickets.merchantId, id)).orderBy(desc(schema.tickets.createdAt));
  if (!rows.length) return <Empty icon={MessageCircle} title="No tickets" actions={<Link className="btn" href={`/support?new=1&merchant=${id}`}>New ticket</Link>}>Support tickets for this merchant will appear here.</Empty>;
  return (
    <div className="tblw"><table className="tbl">
      <thead><tr><th>Ticket</th><th>Subject</th><th>Source</th><th>Status</th><th>Assignee</th><th>Opened</th><th>Updated</th></tr></thead>
      <tbody>{rows.map(({ t, who }) => (
        <tr key={t.id}><td><Link className="rl mono" href={`/support?t=${t.id}`}>{t.number}</Link></td><td>{t.subject}</td><td><span className={`tag ${t.source === "maverick" ? "acc" : ""}`}>{t.source === "maverick" ? "Maverick" : "Internal"}</span></td>
          <td><Pill status={t.status} /></td><td>{who ?? "Unassigned"}</td><td className="muted">{fmtDate(t.createdAt)}</td><td className="muted">{relTime(t.updatedAt)}</td></tr>
      ))}</tbody>
    </table></div>
  );
}

async function Chargebacks({ id }: { id: string }) {
  const rows = await db.select({ c: schema.chargebacks, mid: schema.merchantAccounts.mid }).from(schema.chargebacks).leftJoin(schema.merchantAccounts, eq(schema.chargebacks.merchantAccountId, schema.merchantAccounts.id))
    .where(eq(schema.chargebacks.merchantId, id)).orderBy(desc(schema.chargebacks.receivedAt));
  if (!rows.length) return <Empty icon={CreditCard} title="No chargebacks">Good news: no disputes on record.</Empty>;
  return (
    <div className="tblw"><table className="tbl">
      <thead><tr><th>Case ID</th><th>MID</th><th className="r">Amount</th><th>Reason</th><th>Received</th><th>Respond by</th><th>Status</th></tr></thead>
      <tbody>{rows.map(({ c, mid }) => { const d = daysUntil(c.respondBy); return (
        <tr key={c.id}><td><Link className="rl mono" href={`/chargebacks?cb=${c.id}`}>{c.caseId}</Link></td><td className="mono muted">{mid ?? "—"}</td><td className="r">{usd(c.amount)}</td><td>{[c.reasonCode, c.reason].filter(Boolean).join(" ")}</td>
          <td className="muted">{fmtDate(c.receivedAt)}</td><td>{fmtDate(c.respondBy)}{c.status === "Processed" && d !== null && <span className={`sm ${d < 3 ? "tx-red" : "subtle"}`}> · {d <= 0 ? "due today" : `${d} days`}</span>}</td><td><Pill status={c.status} /></td></tr>
      ); })}</tbody>
    </table></div>
  );
}

async function Payouts({ acctIds }: { acctIds: string[] }) {
  if (!acctIds.length) return <Empty icon={CreditCard} title="No payouts yet">Daily deposits appear once the merchant is processing.</Empty>;
  const rows = await db.select({ p: schema.payouts, mid: schema.merchantAccounts.mid, last4: schema.merchantAccounts.bankAccountLast4 }).from(schema.payouts)
    .innerJoin(schema.merchantAccounts, eq(schema.payouts.merchantAccountId, schema.merchantAccounts.id)).where(inArray(schema.payouts.merchantAccountId, acctIds)).orderBy(desc(schema.payouts.depositDate)).limit(31);
  const t = rows.reduce((a, r) => ({ g: a.g + r.p.gross, f: a.f + r.p.fees, c: a.c + r.p.chargebacks, r: a.r + r.p.reserve, n: a.n + r.p.net, b: a.b + r.p.batches }), { g: 0, f: 0, c: 0, r: 0, n: 0, b: 0 });
  return (
    <>
      <div className="lt"><span className="muted sm">Net deposit = gross sales − fees − chargebacks − reserve · stored daily from the processor</span></div>
      <div className="tblw"><table className="tbl compact">
        <thead><tr><th>Deposit date</th><th>MID</th><th className="r">Batches</th><th className="r">Gross sales</th><th className="r">Fees</th><th className="r">Chargebacks</th><th className="r">Reserve</th><th className="r">Net deposit</th><th>Account</th><th>Status</th></tr></thead>
        <tbody>{rows.map(({ p, mid, last4 }) => (
          <tr key={p.id}><td>{fmtDate(p.depositDate)}</td><td className="mono muted">••{mid.slice(-4)}</td><td className="r">{p.batches}</td><td className="r">{usd(p.gross)}</td><td className="r muted">{usd(-p.fees)}</td>
            <td className="r"><span className={p.chargebacks ? "tx-red" : "subtle"}>{usd(-p.chargebacks)}</span></td><td className="r muted">{usd(-p.reserve)}</td><td className="r" style={{ fontWeight: 600 }}>{usd(p.net)}</td>
            <td className="muted mask">{maskAccount(last4)}</td><td><Pill status={p.status} /></td></tr>
        ))}</tbody>
        <tfoot><tr><td>{rows.length} days</td><td /><td className="r">{t.b}</td><td className="r">{usd(t.g)}</td><td className="r">{usd(-t.f)}</td><td className="r">{usd(-t.c)}</td><td className="r">{usd(-t.r)}</td><td className="r">{usd(t.n)}</td><td /><td /></tr></tfoot>
      </table></div>
    </>
  );
}

async function Residuals({ acctIds }: { acctIds: string[] }) {
  if (!acctIds.length) return <Empty icon={CreditCard} title="No residuals yet">Residuals are published monthly by the processor once the merchant is live.</Empty>;
  const rows = await db.select({ r: schema.residualLines, mid: schema.merchantAccounts.mid }).from(schema.residualLines).innerJoin(schema.merchantAccounts, eq(schema.residualLines.merchantAccountId, schema.merchantAccounts.id))
    .where(inArray(schema.residualLines.merchantAccountId, acctIds)).orderBy(desc(schema.residualLines.period)).limit(24);
  return (
    <div className="tblw"><table className="tbl">
      <thead><tr><th>Month</th><th>MID</th><th className="r">Sales count</th><th className="r">Sales volume</th><th className="r">Revenue</th><th className="r">Expense</th><th className="r">Split</th><th className="r">Adjustments</th><th className="r">Profit</th><th className="r">Held</th></tr></thead>
      <tbody>{rows.map(({ r, mid }) => (
        <tr key={r.id}><td>{new Date(r.period + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</td><td className="mono muted">••{mid.slice(-4)}</td><td className="r">{num(r.salesCount)}</td><td className="r">{usd(r.salesAmount)}</td>
          <td className="r">{usd(r.revenue)}</td><td className="r muted">{usd(-r.expense)}</td><td className="r">{r.splitPct}%</td><td className="r"><span className={r.adjustment ? "tx-red" : "subtle"} title={r.adjustmentNote ?? ""}>{usd(r.adjustment)}</span></td>
          <td className="r" style={{ fontWeight: 600 }}>{usd(r.profit)}</td><td className="r">{r.held ? <span className="tx-amber" title={r.heldNote ?? ""}>{usd(r.held)}</span> : <span className="subtle">—</span>}</td></tr>
      ))}</tbody>
    </table></div>
  );
}

async function Documents({ id }: { id: string }) {
  const docs = await db.select({ d: schema.applicationDocuments, num: schema.applications.number }).from(schema.applicationDocuments)
    .innerJoin(schema.applications, eq(schema.applicationDocuments.applicationId, schema.applications.id)).where(eq(schema.applications.merchantId, id));
  if (!docs.length) return <Empty icon={FileText} title="No documents">Boarding documents (voided check, IDs, statements) are tracked here. File storage isn’t connected yet in this build.</Empty>;
  return (
    <>
      <div className="lt"><span className="muted sm">Required vs uploaded, per application · file storage (S3) is not connected in this build</span></div>
      <div className="tblw"><table className="tbl">
        <thead><tr><th>Document</th><th>Required</th><th>Linked to</th><th>Uploaded</th><th>Status</th></tr></thead>
        <tbody>{docs.map(({ d, num: n }) => (
          <tr key={d.id}><td><span className="row" style={{ gap: 8 }}><FileText size={16} aria-hidden="true" className="subtle" /><span style={{ fontWeight: 500 }}>{d.name}</span></span></td><td className="muted">{d.required ? "Required" : "Optional"}</td>
            <td className="mono muted">{n}</td><td className="muted">{d.uploadedAt ? fmtDate(d.uploadedAt) : "—"}</td><td><Pill status={d.uploaded ? "Uploaded" : "Missing"} /></td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function Contacts({ contacts }: { contacts: (typeof schema.contacts.$inferSelect)[] }) {
  if (!contacts.length) return <Empty icon={Phone} title="No contacts">Add contacts when creating the merchant or from a boarding application.</Empty>;
  return (
    <div className="tblw"><table className="tbl">
      <thead><tr><th>Name</th><th>Role</th><th>Ownership</th><th>Tags</th><th>Phone</th><th>Email</th><th>Last contacted</th></tr></thead>
      <tbody>{contacts.map((c) => (
        <tr key={c.id}><td><span className="who"><Avatar initials={initialsOf(`${c.firstName} ${c.lastName}`)} color="av-4" /><b style={{ fontWeight: 500 }}>{c.firstName} {c.lastName}</b></span></td><td className="muted">{c.title ?? "—"}</td>
          <td className="num">{c.ownershipPct ? `${c.ownershipPct}%` : "—"}</td><td><span className="row" style={{ gap: 4 }}>{c.labels.map((l) => <span key={l} className="tag">{l}</span>)}</span></td>
          <td className="num">{c.phone ? <a href={`tel:${c.phone}`} style={{ textDecoration: "none" }}>{c.phone}</a> : "—"}</td><td>{c.email ? <a href={`mailto:${c.email}`} style={{ textDecoration: "none" }}>{c.email}</a> : "—"}</td>
          <td className="muted">{c.lastContactedAt ? fmtDate(c.lastContactedAt) : "—"}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
