"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, CircleAlert, Send, TriangleAlert, Users } from "lucide-react";
import { confirmDialog, notify } from "@/components/confirm";
import { Pill, type Tone } from "@/components/ui";
import { fmtDateTime, num, pct, MERCHANT_STATUS_LABEL, SOURCE_LABEL } from "@/lib/format";
import { sendProblems, sendWarnings, type Audience } from "@/lib/email/types";
import { audienceSummary, cancelCampaign, scheduleCampaign, sendNow, sendTest, type AudienceSummary } from "../actions";
import type { CampaignProps, Doc, MailInfo, Report, Update } from "./shared";

type Opt = { id: string; name: string };
const people = (n: number) => `${num(n)} ${n === 1 ? "person" : "people"}`;

/** Live recipient count for the audience being edited (debounced). */
export function useAudience(audience: Audience) {
  const [data, setData] = useState<AudienceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(audience);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await audienceSummary(JSON.parse(key) as Audience);
      if (live) { setData(r); setLoading(false); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  return { data, loading };
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function AudiencePanel({ doc, update, locked, owners, forms, summary, loading }: {
  doc: Doc; update: Update; locked: boolean; owners: Opt[]; forms: Opt[]; summary: AudienceSummary | null; loading: boolean;
}) {
  const a = doc.audience;
  const setL = (p: Partial<Audience["leads"]>) => update((d) => ({ ...d, audience: { ...d.audience, leads: { ...d.audience.leads, ...p } } }));
  const setM = (p: Partial<Audience["merchants"]>) => update((d) => ({ ...d, audience: { ...d.audience, merchants: { ...d.audience.merchants, ...p } } }));
  const ownerOpts = <><option value="any">Anyone</option><option value="none">Unassigned</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</>;
  const ex = summary?.excluded;
  const left = ex ? ex.noEmail + ex.invalid + ex.duplicate + ex.suppressed : 0;

  return (
    <div className="em-aud">
      <div className="stack">
        <section className={`card em-audc ${a.leads.on ? "on" : ""}`} aria-labelledby="au-l">
          <div className="card-h"><h2 id="au-l">Leads</h2><Switch on={a.leads.on} disabled={locked} label="Send to leads" onChange={(on) => setL({ on })} /></div>
          {a.leads.on && (
            <div className="card-b form-grid expand-in">
              <label className="field"><span className="lab">Status</span>
                <select className="inp" value={a.leads.status} disabled={locked} onChange={(e) => setL({ status: e.target.value as Audience["leads"]["status"] })}>
                  <option value="open">Open</option><option value="converted">Converted</option><option value="disqualified">Disqualified</option><option value="any">Any status</option>
                </select></label>
              <label className="field"><span className="lab">Source</span>
                <select className="inp" value={a.leads.source} disabled={locked} onChange={(e) => setL({ source: e.target.value as Audience["leads"]["source"] })}>
                  <option value="any">Any source</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="field"><span className="lab">Owner</span><select className="inp" value={a.leads.ownerId} disabled={locked} onChange={(e) => setL({ ownerId: e.target.value })}>{ownerOpts}</select></label>
              <label className="field"><span className="lab">Came from form</span>
                <select className="inp" value={a.leads.formId} disabled={locked} onChange={(e) => setL({ formId: e.target.value })}>
                  <option value="any">Any (or none)</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select></label>
            </div>
          )}
        </section>
        <section className={`card em-audc ${a.merchants.on ? "on" : ""}`} aria-labelledby="au-m">
          <div className="card-h"><h2 id="au-m">Merchants</h2><Switch on={a.merchants.on} disabled={locked} label="Send to merchants" onChange={(on) => setM({ on })} /></div>
          {a.merchants.on && (
            <div className="card-b stack expand-in" style={{ gap: 12 }}>
              <div className="form-grid">
                <label className="field"><span className="lab">Status</span>
                  <select className="inp" value={a.merchants.status} disabled={locked} onChange={(e) => setM({ status: e.target.value as Audience["merchants"]["status"] })}>
                    {Object.entries(MERCHANT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="any">Any status</option>
                  </select></label>
                <label className="field"><span className="lab">Owner</span><select className="inp" value={a.merchants.ownerId} disabled={locked} onChange={(e) => setM({ ownerId: e.target.value })}>{ownerOpts}</select></label>
              </div>
              <p className="hint" style={{ margin: 0 }}>Goes to a contact marked Primary or Owner if they have an email, otherwise the merchant’s customer-service email. Hidden merchants are never included.</p>
            </div>
          )}
        </section>
      </div>

      <section className="card em-sum" aria-live="polite" aria-busy={loading}>
        <div className="card-h"><h2>Who gets it</h2>{loading && <span className="subtle sm">Counting…</span>}</div>
        <div className="card-b stack" style={{ gap: 14 }}>
          {!a.leads.on && !a.merchants.on ? (
            <p className="muted" style={{ margin: 0 }}>Turn on Leads, Merchants or both to choose who gets this newsletter.</p>
          ) : summary?.error ? (
            <p className="tx-red" style={{ margin: 0 }}>{summary.error}</p>
          ) : (
            <>
              <div className="em-count"><Users size={18} aria-hidden="true" /><b>{summary ? num(summary.count) : "…"}</b><span>{summary?.count === 1 ? "person" : "people"} right now</span></div>
              <p className="hint" style={{ margin: 0 }}>The list is worked out again at the moment it sends, so people added before then are included.</p>
              {ex && left > 0 && (
                <dl className="dl em-ex">
                  {ex.suppressed > 0 && <><dt>Unsubscribed or blocked</dt><dd>{num(ex.suppressed)} <Link href="/email/suppressed">View list</Link></dd></>}
                  {ex.noEmail > 0 && <><dt>No email address</dt><dd>{num(ex.noEmail)}</dd></>}
                  {ex.invalid > 0 && <><dt>Email looks wrong</dt><dd>{num(ex.invalid)}</dd></>}
                  {ex.duplicate > 0 && <><dt>Same address twice</dt><dd>{num(ex.duplicate)} (sent once)</dd></>}
                </dl>
              )}
              {summary && summary.sample.length > 0 && (
                <div className="tblw"><table className="tbl compact">
                  <thead><tr><th>First {summary.sample.length}</th><th>Type</th></tr></thead>
                  <tbody>{summary.sample.map((s) => <tr key={s.email}><td>{s.email}<div className="subtle sm">{[s.name, s.businessName].filter(Boolean).join(" · ") || "—"}</div></td><td className="muted">{s.kind}</td></tr>)}</tbody>
                </table></div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Line({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const I = ok ? Check : warn ? TriangleAlert : CircleAlert;
  return <li className={ok ? "ok" : warn ? "warn" : "bad"}><I size={16} aria-hidden="true" /><span>{children}</span></li>;
}

export function SendPanel({ campaign, doc, mail, mailProblems, summary, user, flush, report }: {
  campaign: CampaignProps; doc: Doc; mail: MailInfo; mailProblems: string[]; summary: AudienceSummary | null; user: { email: string }; flush: () => Promise<boolean>; report: Report | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [when, setWhen] = useState("");
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const status = campaign.status;
  const problems = [...sendProblems(doc), ...mailProblems];
  const warnings = sendWarnings(doc);
  const count = summary?.count ?? 0;
  const nobody = problems.length === 0 && summary !== null && !summary.error && count === 0;
  const ready = problems.length === 0 && !nobody && summary !== null;
  const minutes = Math.max(1, Math.ceil(count / Math.max(1, mail.sendsPerMinute)));

  const run = (fn: () => Promise<{ ok?: string; error?: string; problems?: string[] }>) => start(async () => {
    if (status === "draft" && !(await flush())) { notify("Couldn’t save your latest changes, so nothing was sent. Try again.", { error: true }); return; }
    const r = await fn();
    setServerProblems(r.problems ?? []);
    notify(r.ok ?? r.error ?? "", { error: !!r.error });
    if (r.ok) router.refresh();
  });

  if (status === "sending" || status === "sent" || status === "cancelled") {
    const c = report?.counts;
    return (
      <section className="card">
        <div className="card-h"><h2>{status === "sending" ? "Sending now" : status === "sent" ? "Sent" : "Sending was stopped"}</h2></div>
        <div className="card-b stack" style={{ gap: 14 }}>
          {status === "sending" && c && <>
            <div className="em-prog" role="progressbar" aria-valuemin={0} aria-valuemax={c.total || 1} aria-valuenow={c.total - c.waiting} aria-label="Sending progress"><span style={{ width: `${c.total ? ((c.total - c.waiting) / c.total) * 100 : 3}%` }} /></div>
            <p style={{ margin: 0 }}>{campaign.snapshotted ? `${num(c.sent)} of ${num(c.total)} sent. Up to ${num(mail.sendsPerMinute)} go out each minute.` : "Getting the list ready. Sending starts within a minute."}</p>
            {campaign.lastError && <p className="tx-red" style={{ margin: 0 }}>Paused: {campaign.lastError} It will try again every minute.</p>}
            <div><button className="btn danger" type="button" disabled={pending} onClick={async () => {
              if (await confirmDialog(`${people(c.waiting)} haven’t been sent to yet and won’t get it. People who already received it are not affected.`, { title: "Stop sending?", confirmLabel: "Stop sending", danger: true })) run(() => cancelCampaign(campaign.id));
            }}>Stop sending</button></div>
          </>}
          {status !== "sending" && <p style={{ margin: 0 }}>{c ? `Delivered to the mail server for ${people(c.sent)}${campaign.finishedAt ? ` on ${fmtDateTime(campaign.finishedAt)}` : ""}.` : "No recipients."} See the Report tab for opens and clicks. To send it again or change it, duplicate it from the menu at the top.</p>}
        </div>
      </section>
    );
  }

  return (
    <div className="em-send">
      <section className="card">
        <div className="card-h"><h2>Check before sending</h2></div>
        <ul className="em-check">
          <Line ok={!!doc.subject.trim()}>{doc.subject.trim() ? <>Subject: <b>{doc.subject}</b></> : "No subject line yet"}</Line>
          <Line ok>From <b>{doc.fromName || mail.fromName}</b> &lt;{mail.fromAddress}&gt;, replies to {doc.replyTo || mail.replyTo || mail.fromAddress}</Line>
          <Line ok={ready || (summary !== null && count > 0)}>{summary === null ? "Counting recipients…" : count > 0 ? <>Goes to <b>{people(count)}</b>{count > mail.sendsPerMinute ? `, taking about ${num(minutes)} minutes` : ""}</> : "Nobody is selected yet"}</Line>
          {[...problems, ...serverProblems.filter((p) => !problems.includes(p))].map((p) => <Line key={p} ok={false}>{p}</Line>)}
          {nobody && <Line ok={false}>Nobody matches the audience you chose (or everyone has unsubscribed).</Line>}
          {warnings.map((w) => <Line key={w} ok={false} warn>{w}</Line>)}
          {mail.postalAddress.trim() && <Line ok>Footer shows your address and an unsubscribe link</Line>}
        </ul>
      </section>

      <section className="card">
        <div className="card-h"><h2>{status === "scheduled" ? "Scheduled" : "Send"}</h2>{status === "scheduled" && <Pill status="scheduled" label="Scheduled" tone="amber" />}</div>
        <div className="card-b stack" style={{ gap: 16 }}>
          {status === "scheduled" ? <>
            <p style={{ margin: 0 }}>This newsletter will send on <b>{fmtDateTime(campaign.scheduledAt)}</b> to whoever matches the audience at that moment ({people(count)} right now).</p>
            <div className="row w" style={{ gap: 8 }}>
              <button className="btn" type="button" disabled={pending} onClick={() => run(() => cancelCampaign(campaign.id))}>Cancel schedule and edit</button>
              <button className="btn pri" type="button" disabled={pending || !ready} onClick={async () => { if (await confirmDialog(`It goes to ${people(count)} straight away. This can’t be undone.`, { title: "Send now instead?", confirmLabel: `Send to ${people(count)}` })) run(() => sendNow(campaign.id)); }}><Send size={16} aria-hidden="true" />Send now instead</button>
            </div>
          </> : <>
            <div className="row w" style={{ gap: 8, alignItems: "center" }}>
              <button className="btn" type="button" disabled={pending || doc.blocks.length === 0} onClick={() => run(() => sendTest(campaign.id))}>Send a test to me</button>
              <span className="subtle sm">Goes to {user.email} only.</span>
            </div>
            <hr className="divider" />
            <div className="row w" style={{ gap: 8, alignItems: "flex-end" }}>
              <label className="field" style={{ flex: "0 1 240px" }}><span className="lab">Send later (your local time)</span>
                <input type="datetime-local" className="inp" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
              <button className="btn" type="button" disabled={pending || !ready || !when} onClick={() => run(() => scheduleCampaign(campaign.id, new Date(when).toISOString()))}><CalendarClock size={16} aria-hidden="true" />Schedule</button>
              <span className="sp" />
              <button className="btn pri" type="button" disabled={pending || !ready} onClick={async () => {
                if (await confirmDialog(`It goes to ${people(count)} straight away. This can’t be undone.`, { title: `Send “${doc.name}” now?`, confirmLabel: `Send to ${people(count)}` })) run(() => sendNow(campaign.id));
              }}><Send size={16} aria-hidden="true" />Send now</button>
            </div>
            {!ready && <p className="hint" style={{ margin: 0 }}>Fix the items marked above to send or schedule.</p>}
          </>}
        </div>
      </section>
    </div>
  );
}

const R_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Waiting", tone: "neutral" }, sending: { label: "Sending", tone: "blue" }, sent: { label: "Sent", tone: "green" }, failed: { label: "Failed", tone: "red" }, skipped: { label: "Not sent", tone: "gray" },
};

export function ReportPanel({ report, live }: { report: Report; live: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!live) return; const t = setInterval(() => router.refresh(), 5000); return () => clearInterval(t); }, [live, router]);
  const c = report.counts;
  const rate = (n: number) => (c.sent ? pct((n / c.sent) * 100, 0) : "—");
  const tile = (l: string, v: string, s?: string) => <div className="card kpi"><span className="l">{l}</span><span className="v">{v}</span><span className="s">{s}</span></div>;
  return (
    <div className="stack">
      <div className="kpis">
        {tile("Sent", num(c.sent), c.waiting ? `${num(c.waiting)} still to go` : `of ${num(c.total)}`)}
        {tile("Opened", rate(c.opened), `${num(c.opened)} ${c.opened === 1 ? "person" : "people"}`)}
        {tile("Clicked", rate(c.clicked), `${num(c.clicked)} ${c.clicked === 1 ? "person" : "people"}`)}
        {tile("Unsubscribed", num(c.unsubscribed), c.sent ? rate(c.unsubscribed) : "")}
        {tile("Failed", num(c.failed), c.skipped ? `${num(c.skipped)} not sent` : "")}
      </div>
      <p className="hint" style={{ margin: 0 }}>Opens are an estimate: some mail apps hide them and others open every email automatically. Clicks are reliable. Addresses that bounce after the mail server accepts them aren’t reported here.</p>
      {report.links.length > 0 && (
        <section className="card lv" aria-label="Links">
          <div className="card-h"><h2>Links</h2></div>
          <div className="tblw"><table className="tbl compact"><thead><tr><th>Address</th><th className="r">Clicks</th></tr></thead>
            <tbody>{report.links.map((l) => <tr key={l.url}><td className="em-url">{l.url}</td><td className="r">{num(l.clicks)}</td></tr>)}</tbody></table></div>
        </section>
      )}
      <section className="card lv" aria-label="Recipients">
        <div className="card-h"><h2>Recipients</h2>{c.total > report.recipients.length && <span className="subtle sm">Showing {num(report.recipients.length)} of {num(c.total)}, most engaged first</span>}</div>
        <div className="tblw"><table className="tbl compact">
          <thead><tr><th>Person</th><th>Status</th><th className="r">Opens</th><th className="r">Clicks</th></tr></thead>
          <tbody>{report.recipients.map((r) => {
            const s = R_STATUS[r.status] ?? R_STATUS.queued!;
            const href = r.leadId ? `/leads?lead=${r.leadId}` : r.merchantId ? `/merchants/${r.merchantId}` : null;
            return (
              <tr key={r.id}>
                <td>{href ? <Link className="rl" href={href}>{r.email}</Link> : r.email}<div className="subtle sm">{[r.name, r.businessName].filter(Boolean).join(" · ") || "—"}</div></td>
                <td><Pill status={r.status} label={r.unsubscribed ? "Unsubscribed" : s.label} tone={r.unsubscribed ? "gray" : s.tone} />{r.error && <div className="subtle sm">{r.error}</div>}</td>
                <td className="r">{r.opens || "—"}</td><td className="r">{r.clicks || "—"}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>
    </div>
  );
}
