import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus, ChevronRight } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { relTime } from "@/lib/format";
import { Pill } from "@/components/ui";
import { addConnection } from "../actions";

export const metadata = { title: "Settings · Integrations" };

const MODE_LABEL = { sandbox: "Sandbox", production: "Production" } as const;

export default async function IntegrationsPage() {
  await requirePage("integrations.manage");
  const conns = await db.select().from(schema.processorConnections).orderBy(asc(schema.processorConnections.createdAt));
  return (
    <section className="card">
      <div className="card-h"><h2>Processor connections</h2><span className="subtle sm">Every MID belongs to one processor connection</span></div>
      {conns.map((c) => (
        <Link key={c.id} href={`/settings/integrations/${c.id}`} className="row w" style={{ padding: 16, gap: 14, borderBottom: "1px solid var(--line)", textDecoration: "none", color: "var(--ink)" }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink)", color: "var(--surface)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16, flex: "none", border: "1px solid var(--line)" }}>M</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <b style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</b>
              <span className="tag">{MODE_LABEL[c.mode]}</span>
              {c.enabled ? <Pill status={c.lastSyncStatus === "failed" ? "Failed" : "Connected"} label={c.lastSyncStatus === "failed" ? "Sync failed" : "Enabled"} /> : <Pill status="Inactive" label="Disabled" />}
            </div>
            <div className="subtle sm">
              {`${c.dashboardBaseUrl ?? "—"} · token ${c.tokenLast4 ? `••••${c.tokenLast4}` : "not set"}`}
              {" · "}{c.lastSyncAt ? `last sync ${relTime(c.lastSyncAt)}` : "never synced"}
            </div>
          </div>
          <ChevronRight size={16} aria-hidden="true" className="subtle" />
        </Link>
      ))}
      <div className="row w" style={{ padding: 16, gap: 14 }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, border: "1px dashed var(--line-strong)", color: "var(--ink-3)", display: "grid", placeItems: "center", flex: "none" }}><Plus size={16} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Add a connection</div>
          <div className="subtle sm">Another Maverick account (e.g. a second ISO portfolio). Other processors need a new adapter in <span className="mono">src/processors/</span>; the data model already supports them.</div>
        </div>
        <form action={addConnection}><button className="btn" type="submit">Add Maverick connection</button></form>
      </div>
    </section>
  );
}
