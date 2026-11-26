import Link from "next/link";
import type { Metadata } from "next";
import { Mail, Monitor } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/dal";
import { getAccount } from "@/lib/portal/data";
import { day, when } from "../../ui";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Account" };

const change = (what: string) => `/requests/new?kind=account_change&what=${encodeURIComponent(what)}`;

export default async function Account() {
  const u = await requirePortalUser();
  const a = await getAccount(u);
  if (!a) return <p className="mp-callout bad">We couldn&apos;t load your account. Please try again in a minute.</p>;
  const b = a.business;

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>Account</h1>
          <p>What we have on file for {b.dbaName}. To change anything, send us a request: nothing changes until we&apos;ve checked it with you.</p>
        </div>
        <div className="acts"><Link className="mp-btn sec" href="/requests/new?kind=account_change">Request a change</Link></div>
      </div>

      <div className="mp-grid2">
        <section className="mp-card" aria-labelledby="biz-h">
          <h2 id="biz-h">Your business</h2>
          <dl className="mp-rows" style={{ margin: "10px 0 0" }}>
            <div><dt>Business name</dt><dd>{b.dbaName}</dd></div>
            {b.legalName && <div><dt>Legal name</dt><dd>{b.legalName}{b.entityType && !b.legalName.toLowerCase().includes(b.entityType.toLowerCase()) ? `, ${b.entityType}` : ""}</dd></div>}
            {b.einLast4 && <div><dt>Tax ID (EIN)</dt><dd className="amt">••-•••{b.einLast4}</dd></div>}
            {b.address && <div><dt>Address</dt><dd>{b.address}</dd></div>}
            {b.phone && <div><dt>Customer phone</dt><dd>{b.phone}</dd></div>}
            {b.email && <div><dt>Customer email</dt><dd>{b.email}</dd></div>}
            {b.industry && <div><dt>Industry</dt><dd>{b.industry}</dd></div>}
            {b.liveSince && <div><dt>Taking cards since</dt><dd>{day(b.liveSince)}, {b.liveSince.slice(0, 4)}</dd></div>}
          </dl>
          <p className="sm" style={{ marginTop: 12 }}><Link href={change("Business name or address")}>Change business details</Link></p>
        </section>

        <section className="mp-card" aria-labelledby="am-h">
          <h2 id="am-h">Your account manager</h2>
          {a.manager ? (
            <>
              <div className="mp-am">
                {a.manager.photo
                  // eslint-disable-next-line @next/next/no-img-element -- a private, per-session photo; the image optimizer can't fetch it
                  ? <img className="mp-am-ph" src={a.manager.photo} alt={`Photo of ${a.manager.name}`} width={72} height={72} />
                  : <span className="mp-am-ph" aria-hidden="true">{a.manager.initials}</span>}
                <div>
                  <p className="mp-am-name">{a.manager.name}</p>
                  <p className="sm muted">Your go-to person for questions, equipment, changes and trips.</p>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                <Link className="mp-btn sm" href="/requests/new?kind=support">Send a request</Link>
                <a className="mp-btn sec sm" href={`mailto:${a.manager.email}`}><Mail aria-hidden="true" />Email {a.manager.name.split(" ")[0]}</a>
              </div>
            </>
          ) : (
            <>
              <p className="sm muted" style={{ marginTop: 10 }}>We&apos;re assigning someone to your account. Until then, requests go to our support team.</p>
              <p style={{ marginTop: 12 }}><Link className="mp-btn sm" href="/requests/new?kind=support">Send a request</Link></p>
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="accts-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 id="accts-h">Merchant accounts and terminals</h2>
        {a.accounts.length === 0 && <p className="mp-callout">Your merchant account is still being set up. It shows here once it&apos;s open.</p>}
        {a.accounts.map((acct) => (
          <div key={acct.id} className="mp-card">
            <div className="mp-head" style={{ alignItems: "center" }}>
              <div>
                <h3>Account ending {acct.mid.slice(-4)}</h3>
                <p className="sm" style={{ marginTop: 2 }}>{acct.channel}{acct.openedAt ? ` · opened ${day(acct.openedAt)}, ${acct.openedAt.slice(0, 4)}` : ""} · deposits go to {acct.bank}</p>
              </div>
              <span className={`mp-badge ${acct.status === "Live" ? "ok" : ""}`}>{acct.status === "Live" ? "Active" : acct.status}</span>
            </div>
            {acct.terminals.length > 0 && (
              <ul className="mp-lines" aria-label="Terminals">
                {acct.terminals.map((t) => (
                  <li key={t.id}>
                    <span className="mp-ico terminal"><Monitor aria-hidden="true" /></span>
                    <span className="tx"><b>{t.name}</b><span>{[t.model, t.location, `ID ${t.tid}`].filter(Boolean).join(" · ")}</span></span>
                  </li>
                ))}
              </ul>
            )}
            <p className="sm" style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link href={change("Deposit bank account")}>Change the deposit account</Link>
              <Link href="/requests/new?kind=equipment">Order equipment or supplies</Link>
            </p>
          </div>
        ))}
      </section>

      <div className="mp-grid2">
        <section className="mp-card" aria-labelledby="ppl-h">
          <h2 id="ppl-h">People on file</h2>
          {a.contacts.length === 0 ? <p className="sm muted" style={{ marginTop: 10 }}>No contacts on file yet.</p> : (
            <dl className="mp-rows" style={{ margin: "10px 0 0" }}>
              {a.contacts.map((c) => (
                <div key={c.id}><dt><b style={{ color: "var(--ink-900)" }}>{c.name}</b>{c.labels.length ? <><br /><span className="sm muted">{c.labels.join(", ")}</span></> : null}</dt><dd className="sm">{[c.email, c.phone].filter(Boolean).map((x) => <span key={x} style={{ display: "block" }}>{x}</span>)}</dd></div>
              ))}
            </dl>
          )}
          <p className="sm" style={{ marginTop: 12 }}><Link href={change("Owners or signers")}>Update owners or contacts</Link></p>
        </section>

        <section className="mp-card" aria-labelledby="pw-h">
          <h2 id="pw-h">Signing in</h2>
          <p className="sm muted" style={{ margin: "6px 0 14px" }}>You sign in as {u.email}. {a.logins.length > 1 ? `${a.logins.length} people can sign in to this account.` : ""}{a.logins.find((l) => l.id === u.id)?.lastLoginAt ? ` Last sign-in ${when(a.logins.find((l) => l.id === u.id)!.lastLoginAt!)}.` : ""}</p>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
