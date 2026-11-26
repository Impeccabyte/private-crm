import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/dal";
import { getRequest, REQUEST_KINDS } from "@/lib/portal/data";
import { RequestBadge, when } from "../../../ui";
import { ReplyForm } from "./ReplyForm";

export const metadata: Metadata = { title: "Request" };

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const u = await requirePortalUser();
  const { id } = await params;
  const sp = await searchParams;
  const r = await getRequest(u, id);
  if (!r) notFound();
  const last = r.messages[r.messages.length - 1];
  const waiting = r.status !== "Closed" && last?.kind === "outbound";
  const details = Object.entries(r.details).filter(([, v]) => v);

  return (
    <>
      <p><Link className="mp-back" href="/requests"><ArrowLeft aria-hidden="true" />All requests</Link></p>
      <div className="mp-head">
        <div>
          <h1>{r.subject}</h1>
          <p>{REQUEST_KINDS[r.kind]?.label ?? "Request"} · {r.number} · sent {when(r.createdAt)}{r.assignee ? ` · ${r.assignee} has it` : " · we'll assign it to someone shortly"}</p>
        </div>
        <RequestBadge status={r.status} waiting={waiting} />
      </div>

      {sp.sent && <p className="mp-callout ok" role="status">Sent. {r.assignee ? `${r.assignee.split(" ")[0]} will` : "We'll"} reply here and by email to {u.email}.</p>}

      <div className="mp-threadgrid">
        <section className="mp-thread" aria-label="Conversation">
          {r.messages.map((m) => (
            <article key={m.id} className={`mp-msg ${m.kind === "inbound" ? "me" : "them"}`}>
              <header><b>{m.kind === "inbound" ? (m.author ?? "You") : (m.author ?? "Impeccabyte")}</b><time dateTime={m.at.toISOString()}>{when(m.at)}</time></header>
              <p>{m.body}</p>
            </article>
          ))}
          <ReplyForm ticketId={r.id} closed={r.status === "Closed"} />
        </section>

        {(details.length > 0 || r.hasSensitive) && (
          <aside className="mp-card" aria-label="What you sent">
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>What you sent</h2>
            <dl className="mp-rows" style={{ margin: 0 }}>
              {details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {r.hasSensitive && <p className="sm muted" style={{ marginTop: 10, display: "flex", gap: 8 }}><Lock className="ic" aria-hidden="true" style={{ width: 16 }} />Bank details are encrypted and hidden here.</p>}
          </aside>
        )}
      </div>
    </>
  );
}
