import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/dal";
import { getRequests, REQUEST_KINDS, type RequestKind } from "@/lib/portal/data";
import { RequestBadge, when } from "../../ui";

export const metadata: Metadata = { title: "Requests" };

export default async function Requests() {
  const u = await requirePortalUser();
  const rows = await getRequests(u);
  const open = rows.filter((r) => r.status !== "Closed");
  const done = rows.filter((r) => r.status === "Closed");

  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <Link className="mp-row" href={`/portal/requests/${r.id}`}>
      <div className="tx">
        <b>{r.subject}</b>
        <span>{REQUEST_KINDS[(r.kind ?? "support") as RequestKind]?.label ?? "Request"} · {r.number} · {r.waitingOnYou ? `${r.lastAuthor?.split(" ")[0] ?? "We"} replied ${when(r.lastAt)}` : `updated ${when(r.updatedAt)}`}{r.assignee ? ` · with ${r.assignee.split(" ")[0]}` : ""}</span>
      </div>
      <RequestBadge status={r.status} waiting={r.waitingOnYou} />
      <ChevronRight className="ic go" aria-hidden="true" />
    </Link>
  );

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>Requests</h1>
          <p>Questions, equipment, account changes and trips. Each one goes to a person on our team, and you can follow the conversation here.</p>
        </div>
        <div className="acts"><Link className="mp-btn" href="/portal/requests/new"><Plus aria-hidden="true" />New request</Link></div>
      </div>

      {rows.length === 0 && (
        <div className="mp-empty">
          <h2>No requests yet</h2>
          <p>Need a new terminal, paper rolls, a change to your account, or just have a question? Send it here and your account manager picks it up.</p>
          <Link className="mp-btn" href="/portal/requests/new">Send your first request</Link>
        </div>
      )}
      {open.length > 0 && (
        <section aria-labelledby="open-h" className="mp-feed mp-day">
          <h2 id="open-h">Open</h2>
          <div className="mp-daycard">{open.map((r) => <Row key={r.id} r={r} />)}</div>
        </section>
      )}
      {done.length > 0 && (
        <section aria-labelledby="done-h" className="mp-feed mp-day">
          <h2 id="done-h">Done</h2>
          <div className="mp-daycard">{done.map((r) => <Row key={r.id} r={r} />)}</div>
        </section>
      )}
    </>
  );
}
