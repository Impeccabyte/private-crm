import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { configOf, MAVERICK_HOSTS, webhookUrl } from "@/lib/integrations";
import { fmtDateTime, relTime } from "@/lib/format";
import { Banner, Pill } from "@/components/ui";
import { ActionButton, ActionForm, CopyButton, Field, Toggle } from "@/components/forms";
import { generateWebhookSecret, resyncNow, retryEvent, rotateWebhookPath, saveConnection, testConnection } from "../../actions";

export const metadata = { title: "Settings · Connection" };

export default async function ConnectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ event?: string }> }) {
  await requirePage("integrations.manage");
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.query.processorConnections.findFirst({ where: eq(schema.processorConnections.id, id) });
  if (!c) notFound();
  const cfg = configOf(c);
  const since = new Date(Date.now() - 24 * 3_600_000);

  const [counts, hourly, problems, recent, runs] = await Promise.all([
    db.select({ status: schema.webhookEvents.status, n: dsql<number>`count(*)::int` }).from(schema.webhookEvents)
      .where(and(eq(schema.webhookEvents.connectionId, id), gte(schema.webhookEvents.receivedAt, since))).groupBy(schema.webhookEvents.status),
    db.select({ h: dsql<number>`extract(epoch from date_trunc('hour', ${schema.webhookEvents.receivedAt}))::bigint`, ok: dsql<number>`count(*) filter (where ${schema.webhookEvents.status} in ('processed','ignored','received'))::int`, bad: dsql<number>`count(*) filter (where ${schema.webhookEvents.status} in ('failed','retrying','rejected'))::int` })
      .from(schema.webhookEvents).where(and(eq(schema.webhookEvents.connectionId, id), gte(schema.webhookEvents.receivedAt, since))).groupBy(dsql`1`),
    db.select().from(schema.webhookEvents).where(and(eq(schema.webhookEvents.connectionId, id), inArray(schema.webhookEvents.status, ["failed", "retrying", "rejected"])))
      .orderBy(desc(schema.webhookEvents.receivedAt)).limit(25),
    db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.connectionId, id)).orderBy(desc(schema.webhookEvents.receivedAt)).limit(10),
    db.select().from(schema.syncRuns).where(eq(schema.syncRuns.connectionId, id)).orderBy(desc(schema.syncRuns.startedAt)).limit(8),
  ]);
  const total24 = counts.reduce((a, r) => a + r.n, 0);
  const bad = counts.filter((r) => ["failed", "retrying", "rejected"].includes(r.status)).reduce((a, r) => a + r.n, 0);
  const firstTry = total24 ? Math.round(((total24 - bad) / total24) * 1000) / 10 : null;
  const selected = problems.find((p) => p.id === sp.event) ?? problems[0] ?? null;

  // 24 hourly buckets for the chart
  const startHour = Math.floor(since.getTime() / 3_600_000) + 1;
  const byHour = new Map(hourly.map((r) => [Math.floor(Number(r.h) / 3600), r]));
  const buckets = Array.from({ length: 24 }, (_, i) => byHour.get(startHour + i) ?? { ok: 0, bad: 0 });
  const max = Math.max(1, ...buckets.map((b) => b.ok + b.bad));
  const url = webhookUrl(c);

  return (
    <>
      <div className="row"><Link className="lnk" href="/settings/integrations">← All connections</Link></div>
      <section className="card">
        <div className="card-h">
          <h2><span className="pm" aria-hidden="true">M</span>{c.name}</h2>
          <div className="row" style={{ gap: 8 }}>
            {c.enabled ? <Pill status="Connected" label="Enabled" /> : <Pill status="Inactive" label="Disabled" />}
            <ActionButton action={testConnection.bind(null, id)} label="Test connection" pendingLabel="Testing…" showDetail />
          </div>
        </div>
        <div className="card-b stack">
          {c.mode === "production" && <Banner tone="amber" title="Production mode">Calls go to live Maverick. Writes (tickets, signature requests, chargeback actions) always ask for confirmation.</Banner>}
          {c.lastTestAt && <div className={`sm ${c.lastTestOk ? "tx-green" : "tx-red"}`}>Last test {relTime(c.lastTestAt)}: {c.lastTestMessage}</div>}
          <ActionForm action={saveConnection} className="stack">
            <input type="hidden" name="id" value={c.id} />
            <div className="form-grid">
              <Field label="Name" name="name"><input id="name" name="name" className="inp" defaultValue={c.name} /></Field>
              <Field label="Mode" name="mode" hint="Sandbox uses sandbox-dashboard.maverickpayments.com.">
                <select id="mode" name="mode" className="inp" defaultValue={c.mode}>
                  <option value="sandbox">Sandbox</option><option value="production">Production</option>
                </select>
              </Field>
              <>
                <Field label="Dashboard API base URL" name="dashboardBaseUrl" hint={`Default: ${MAVERICK_HOSTS[c.mode === "production" ? "production" : "sandbox"]}`}>
                  <input id="dashboardBaseUrl" name="dashboardBaseUrl" className="inp" defaultValue={c.dashboardBaseUrl ?? ""} />
                </Field>
                <Field label="Token type" name="tokenType">
                  <select id="tokenType" name="tokenType" className="inp" defaultValue={c.tokenType}>
                    <option value="agent">Agent token (Platforms)</option><option value="appConnect">App Connect token</option><option value="merchant">Merchant token</option>
                  </select>
                </Field>
                <Field label="API access token" name="token" hint={c.tokenEnc ? `Saved (ends ${c.tokenLast4 ?? "••••"}). Leave blank to keep it. Stored encrypted.` : "Paste the access token from the Maverick Dashboard. Stored encrypted, never shown again."}>
                  <input id="token" name="token" type="password" className="inp" autoComplete="off" placeholder={c.tokenEnc ? "••••••••••••" : ""} />
                </Field>
              </>
              <Field label="Webhook secret" name="webhookSecret" hint={c.webhookSecretEnc ? "Saved. Leave blank to keep it. Must match the secret set for this URL in the Maverick Dashboard." : "Not set — every webhook will be rejected until you add one."}>
                <input id="webhookSecret" name="webhookSecret" type="password" className="inp" autoComplete="off" placeholder={c.webhookSecretEnc ? "••••••••••••" : ""} />
              </Field>
            </div>
            <Toggle name="enabled" label="Enabled" defaultChecked={c.enabled} hint="Disabled connections reject webhooks and skip syncs." />
            <hr className="divider" />
            <div className="sec-t">Sync</div>
            <div className="form-grid">
              <Toggle name="syncMerchants" label="Merchants, DBAs, MIDs and terminals" defaultChecked={cfg.syncMerchants} />
              <Toggle name="syncApplications" label="Boarding applications and underwriting checks" defaultChecked={cfg.syncApplications} />
              <Toggle name="syncTickets" label="Maverick help-desk tickets" defaultChecked={cfg.syncTickets} />
              <Toggle name="syncChargebacks" label="Chargebacks" defaultChecked={cfg.syncChargebacks} />
              <Toggle name="syncResiduals" label="Residuals" defaultChecked={cfg.syncResiduals} />
              <Toggle name="syncPayouts" label="Payouts (stored as daily snapshots)" defaultChecked={cfg.syncPayouts} />
            </div>
            <div className="form-grid">
              <Field label="Nightly reconciliation hour (UTC)" name="nightlySyncHourUtc"><input id="nightlySyncHourUtc" name="nightlySyncHourUtc" type="number" min={0} max={23} className="inp" defaultValue={cfg.nightlySyncHourUtc} /></Field>
              <Field label="Payout look-back (days)" name="payoutLookbackDays"><input id="payoutLookbackDays" name="payoutLookbackDays" type="number" min={1} className="inp" defaultValue={cfg.payoutLookbackDays} /></Field>
              <Field label="Reject webhooks older than (hours, 0 = off)" name="maxEventAgeHours" hint="Maverick sends unzoned dates; they’re read as UTC."><input id="maxEventAgeHours" name="maxEventAgeHours" type="number" min={0} className="inp" defaultValue={cfg.maxEventAgeHours} /></Field>
            </div>
            <Toggle name="confirmWrites" label="Ask for confirmation before writing to Maverick" defaultChecked={cfg.confirmWrites} disabled={c.mode === "production"} hint="Always on in production." />
          </ActionForm>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Webhook endpoint</h2><span className="subtle sm">Register this URL for the events you want in the Maverick Dashboard</span></div>
        <div className="card-b stack">
          <div className="row w" style={{ gap: 8 }}><code className="code" style={{ flex: 1, minWidth: 280 }}>{url}</code><CopyButton text={url} /></div>
          <div className="subtle sm">Signature: SHA-512 of secret + id + module + action + date (Maverick’s scheme — it doesn’t cover the body, so events are also de-duplicated by id and checked for age).</div>
          <div className="row w" style={{ gap: 8 }}>
            <ActionButton action={generateWebhookSecret.bind(null, id)} label="Generate new secret" confirm="Generate a new webhook secret? Webhooks fail until you paste it into the Maverick Dashboard." />
            <ActionButton action={rotateWebhookPath.bind(null, id)} label="Change webhook URL" confirm="Change the webhook URL? The old URL stops working immediately." />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Connection health</h2>
          <div className="row w" style={{ gap: 6 }}>
            <ActionButton action={resyncNow.bind(null, id, "full")} label="Re-sync now" className="btn pri sm" />
            <ActionButton action={resyncNow.bind(null, id, "chargebacks")} label="Chargebacks only" className="btn sm" />
          </div>
        </div>
        <div className="hs" style={{ border: 0, borderBottom: "1px solid var(--line)", borderRadius: 0, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div><span className="l">Last successful sync</span><span className="v">{c.lastSyncAt ? relTime(c.lastSyncAt) : "Never"}</span><span className="s">{c.lastSyncAt ? fmtDateTime(c.lastSyncAt) : "Run a sync to import data"}</span></div>
          <div><span className="l">Webhook events · 24h</span><span className="v">{total24.toLocaleString()}</span><span className="s">{firstTry === null ? "None received" : `${firstTry}% processed cleanly`}</span></div>
          <div><span className="l">Failed, retrying or rejected</span><span className={`v ${bad ? "tx-red" : ""}`}>{problems.length}</span><span className="s">Shown below</span></div>
          <div><span className="l">Last sync status</span><span className="v">{c.lastSyncStatus ? c.lastSyncStatus[0]!.toUpperCase() + c.lastSyncStatus.slice(1) : "—"}</span><span className="s ellipsis" title={c.lastSyncError ?? ""}>{c.lastSyncError ?? " "}</span></div>
        </div>
        <div className="card-b">
          <div className="row" style={{ marginBottom: 8 }}><span className="sec-t" style={{ margin: 0 }}>Events per hour · last 24h</span><span className="sp" /><span className="legend"><span><i className="lg1" />OK</span><span><i style={{ background: "var(--r-ink)" }} />Problem</span></span></div>
          <div role="img" aria-label={`${total24} webhook events in the last 24 hours`} style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 4, alignItems: "end", height: 80 }}>
            {buckets.map((b, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }} title={`${b.ok + b.bad} events`}>
                {b.bad > 0 && <div style={{ height: `${(b.bad / max) * 100}%`, background: "var(--r-ink)", borderRadius: "2px 2px 0 0" }} />}
                <div style={{ height: `${Math.max(b.ok ? 4 : 1, (b.ok / max) * 100)}%`, background: b.ok ? "var(--accent)" : "var(--line)", borderRadius: 2 }} />
              </div>
            ))}
          </div>
          <div className="row subtle sm" style={{ marginTop: 4 }}><span>24h ago</span><span className="sp" /><span>Now</span></div>
        </div>
      </section>

      <section className="card lv">
        <div className="card-h"><h2>Failed, retrying &amp; rejected events</h2></div>
        {problems.length === 0 ? <div className="card-b subtle">No problems. Every event was processed.</div> : (
          <>
            <div className="tblw">
              <table className="tbl compact">
                <thead><tr><th>Event</th><th>Received</th><th className="r">Attempts</th><th>Last error</th><th>Status</th><th className="w0" /></tr></thead>
                <tbody>
                  {problems.map((e) => (
                    <tr key={e.id} className={selected?.id === e.id ? "sel" : ""}>
                      <td className="mono">{e.module ?? "?"}.{e.action ?? "?"}</td>
                      <td className="muted">{fmtDateTime(e.receivedAt)}</td>
                      <td className="r">{e.attempts}</td>
                      <td className="muted"><span className="trunc" title={e.lastError ?? ""}>{e.lastError}</span></td>
                      <td><Pill status={e.status} label={e.status[0]!.toUpperCase() + e.status.slice(1)} /></td>
                      <td><span className="row" style={{ gap: 4 }}>
                        <Link className="btn sm ghost" href={`?event=${e.id}`} scroll={false} aria-current={selected?.id === e.id}>Payload</Link>
                        {e.status !== "rejected" && <ActionButton action={retryEvent.bind(null, e.id)} label="Retry" className="btn sm" />}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected && (
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="row"><span className="sec-t" style={{ margin: 0 }}>Payload · {selected.module}.{selected.action}</span><span className="sp" /><span className="subtle sm mono">{selected.externalId ?? "no id"}</span><CopyButton text={JSON.stringify(selected.payload, null, 2)} /></div>
                <pre className="code">{JSON.stringify(redact(selected.payload), null, 2)}</pre>
                <div className="subtle sm">Bank, tax ID and SSN fields are masked in this preview.</div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid2">
        <section className="card lv">
          <div className="card-h"><h2>Recent events</h2></div>
          <table className="tbl compact"><tbody>
            {recent.length === 0 && <tr><td className="subtle">No events yet.</td></tr>}
            {recent.map((e) => <tr key={e.id}><td className="mono">{e.module}.{e.action}</td><td className="muted">{relTime(e.receivedAt)}</td><td><Pill status={e.status} label={e.status} /></td></tr>)}
          </tbody></table>
        </section>
        <section className="card lv">
          <div className="card-h"><h2>Sync runs</h2></div>
          <table className="tbl compact"><tbody>
            {runs.length === 0 && <tr><td className="subtle">No syncs yet.</td></tr>}
            {runs.map((r) => (
              <tr key={r.id}><td>{r.kind}</td><td className="muted">{relTime(r.startedAt)}</td><td><Pill status={r.status} label={r.status} /></td>
                <td className="muted"><span className="trunc" title={r.error ?? JSON.stringify(r.stats)}>{r.error ?? Object.entries(r.stats as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(" · ")}</span></td></tr>
            ))}
          </tbody></table>
        </section>
      </div>
    </>
  );
}

function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) =>
      /accountnumber|routingnumber|federaltaxid|ssn|password|nationalid/i.test(k) && typeof x !== "object" && x ? [k, `••••${String(x).slice(-4)}`] : [k, redact(x)]));
  }
  return v;
}
