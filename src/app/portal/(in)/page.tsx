import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Building2, ChevronRight, CircleCheck, CornerDownRight, Landmark, MessagesSquare, Monitor, Send, ShieldAlert, type LucideIcon } from "lucide-react";
import { InlineReply } from "./InlineReply";
import { requirePortalUser } from "@/lib/portal/dal";
import { fmtUsd, getFeed, getSummary, type FeedItem } from "@/lib/portal/data";
import { day } from "../ui";

export const metadata: Metadata = { title: "Home" };

const ICON: Record<FeedItem["kind"], LucideIcon> = {
  deposit: Landmark, dispute: ShieldAlert, dispute_result: ShieldAlert, request: Send, reply: MessagesSquare, you_replied: CornerDownRight, request_done: CircleCheck, terminal: Monitor, account: Building2,
};
const ICON_TONE: Record<FeedItem["kind"], string> = {
  deposit: "deposit", dispute: "dispute", dispute_result: "dispute", request: "request", reply: "reply", you_replied: "request", request_done: "deposit", terminal: "terminal", account: "account",
};

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Group feed items under "Today", "Yesterday" or a date, in Central time. */
function groupByDay(items: FeedItem[]) {
  const key = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const today = key(new Date().toISOString());
  const yesterday = key(new Date(Date.now() - 86_400_000).toISOString());
  const groups: { label: string; items: FeedItem[] }[] = [];
  for (const it of items) {
    const raw = it.day ?? key(it.at);
    const k = raw > today ? today : raw;
    const label = k === today ? "Today" : k === yesterday ? "Yesterday" : day(k, true);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ settled?: string }> }) {
  const u = await requirePortalUser();
  const [s, feed] = await Promise.all([getSummary(u), getFeed(u)]);
  const change = s.month.prevSales > 0 ? ((s.month.sales - s.month.prevSales) / s.month.prevSales) * 100 : null;
  const feePct = s.month.sales > 0 ? (s.month.fees / s.month.sales) * 100 : null;
  const groups = groupByDay(feed.items);
  // The settle plays once: only on the redirect right after an inline reply, for that request's newest reply.
  const settled = (await searchParams).settled;
  const freshKey = settled ? feed.items.find((it) => it.kind === "you_replied" && it.ticketId === settled)?.key : undefined;

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>{greeting()}, <em>{u.firstName}</em>.</h1>
          <p>{feed.needs.length ? `${feed.needs.length === 1 ? "One thing needs" : `${feed.needs.length} things need`} you. Everything else is below, newest first.` : "Here's what's happened on your account, newest first."}</p>
        </div>
        <div className="acts"><Link className="mp-btn sec" href="/portal/requests/new">Ask for something</Link></div>
      </div>

      <div className="mp-home">
        <section className="mp-feed mp-needs" aria-label="Needs you">
          {feed.needs.length > 0 ? (
            <>
              <h2 className="need">Needs you <span className="ct">{feed.needs.length}</span></h2>
              {feed.needs.map((n) => (
                <div key={n.key} className="mp-item need">
                  <span className="mp-ico dispute">{n.kind === "dispute" ? <ShieldAlert aria-hidden="true" /> : <MessagesSquare aria-hidden="true" />}</span>
                  <div className="tx"><b>{n.title}</b><span>{n.detail}</span></div>
                  {n.ticketId
                    ? <InlineReply ticketId={n.ticketId} label={n.action} />
                    : <Link className="mp-btn" href={n.href}>{n.action}<ArrowRight aria-hidden="true" /></Link>}
                </div>
              ))}
            </>
          ) : s.hasAccounts ? (
            <div className="mp-allclear" role="status">
              <span className="mp-ico"><CircleCheck aria-hidden="true" /></span>
              <span><b>Nothing needs you right now.</b> We&apos;ll put anything that does right here.</span>
            </div>
          ) : null}
        </section>

        <section className="mp-feed mp-activity" aria-labelledby="feed-h">
          <h2 className="sr" id="feed-h">Your account activity</h2>
          {groups.length === 0 && (
            <div className="mp-empty">
              <h2>Your account is getting set up</h2>
              <p>Deposits, disputes and replies from us show up here as they happen. Once you start taking cards, your first deposit will be the first thing you see.</p>
              <Link className="mp-btn sec" href="/portal/requests/new">Ask us a question</Link>
            </div>
          )}

          {groups.map((g) => (
            <section key={g.label} className="mp-day" aria-label={g.label}>
              <h2>{g.label}</h2>
              <div className="mp-daycard">
                {g.items.map((it) => {
                  const Icon = ICON[it.kind];
                  const body = (
                    <>
                      <span className={`mp-ico ${ICON_TONE[it.kind]}`}><Icon aria-hidden="true" /></span>
                      <div className="tx"><b>{it.title}</b><span>{it.detail}</span></div>
                      {it.amount !== undefined && <span className="amt in">+{fmtUsd(it.amount)}</span>}
                      {it.href && <ChevronRight className="ic go" aria-hidden="true" />}
                    </>
                  );
                  const cls = `mp-row${it.key === freshKey ? " fresh" : ""}`;
                  return it.href
                    ? <Link key={it.key} className={cls} href={it.href}>{body}</Link>
                    : <div key={it.key} className={cls}>{body}</div>;
                })}
              </div>
            </section>
          ))}
        </section>

        <aside className="mp-totals" aria-label="Totals">
          <div className="mp-card">
            <p className="mp-label">Last deposit</p>
            {s.lastDeposit ? (
              <>
                <p className="mp-figure">{fmtUsd(s.lastDeposit.net)}</p>
                <p className="sm muted">{day(s.lastDeposit.date, true)} to {s.lastDeposit.bank}</p>
              </>
            ) : <p className="sm muted" style={{ marginTop: 6 }}>No deposits yet. Your first one shows here.</p>}
            <p className="sm" style={{ marginTop: 10 }}><Link href="/portal/deposits">All deposits</Link></p>
          </div>

          <div className="mp-card">
            <p className="mp-label">{s.month.label} so far</p>
            <dl className="mp-rows" style={{ margin: "6px 0 0" }}>
              <div><dt>Card sales</dt><dd className="amt">{fmtUsd(s.month.sales)}</dd></div>
              <div><dt>Fees</dt><dd className="amt">{fmtUsd(s.month.fees)}</dd></div>
              <div><dt>Deposited</dt><dd className="amt">{fmtUsd(s.month.deposited)}</dd></div>
            </dl>
            <p className="sm muted" style={{ marginTop: 8 }}>
              {[s.month.count ? `${s.month.count.toLocaleString("en-US")} payments` : null,
                change !== null ? `${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(0)}% on last month so far` : null,
                feePct !== null ? `fees ${feePct.toFixed(1)}% of sales` : null].filter(Boolean).join(", ") || "Totals fill in as you take payments."}
            </p>
          </div>

          <div className="mp-card">
            <p className="mp-label">Account health</p>
            <p style={{ margin: "8px 0" }}>
              {s.openDisputes > 0
                ? <span className="mp-badge warn">{s.openDisputes} open {s.openDisputes === 1 ? "dispute" : "disputes"}</span>
                : <span className="mp-badge ok">Good standing</span>}
            </p>
            <dl className="mp-rows" style={{ margin: 0 }}>
              <div><dt>Disputes, last 90 days</dt><dd>{s.disputeRate90 ? <><span className="amt">{s.disputeRate90.toFixed(2)}%</span> of payments</> : "None"}</dd></div>
              <div><dt>Money on hold</dt><dd className="amt">{fmtUsd(s.onHold)}</dd></div>
            </dl>
            <p className="sm" style={{ marginTop: 10 }}><Link href="/portal/disputes">About disputes</Link></p>
          </div>
        </aside>
      </div>
    </>
  );
}
