import Link from "next/link";
import { desc, sql as dsql } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { fmtDate, relTime } from "@/lib/format";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { createForm } from "./actions";

export const metadata = { title: "Lead forms" };

export default async function LeadFormsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("leadforms.manage");
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const forms = await db.select({
    f: schema.leadForms,
    total: dsql<number>`(select count(*)::int from lead_form_submissions s where s.form_id = "lead_forms"."id")`,
    last30: dsql<number>`(select count(*)::int from lead_form_submissions s where s.form_id = "lead_forms"."id" and s.created_at >= now() - interval '30 days')`,
    lastAt: dsql<string | null>`(select max(s.created_at) from lead_form_submissions s where s.form_id = "lead_forms"."id")`,
  }).from(schema.leadForms).where(showArchived ? dsql`${schema.leadForms.archivedAt} is not null` : dsql`${schema.leadForms.archivedAt} is null`).orderBy(desc(schema.leadForms.updatedAt));

  return (
    <div className="content">
      <PageHeader title="Lead forms" crumbs={[{ href: "/ase/leads", label: "Leads" }, { label: "Forms" }]}
        sub="Build a form, publish it, and paste the snippet into any website. Submissions arrive in Leads."
        actions={<form action={createForm}><button className="btn pri" type="submit"><Plus size={16} aria-hidden="true" />New form</button></form>} />
      <section className="card lv" aria-label="Lead forms">
        <div className="lt">
          <div className="views">
            <Link href="/ase/leads/forms" className={`vt ${showArchived ? "" : "on"}`}>Active</Link>
            <Link href="/ase/leads/forms?archived=1" className={`vt ${showArchived ? "on" : ""}`}>Archived</Link>
          </div>
        </div>
        {forms.length === 0 ? (
          <Empty icon={FileText} title={showArchived ? "No archived forms" : "No lead forms yet"}
            actions={showArchived ? undefined : <form action={createForm}><button className="btn pri" type="submit">Create your first form</button></form>}>
            {showArchived ? "Archived forms show up here." : "Start from a ready-made form for merchant enquiries, then change the fields to suit."}
          </Empty>
        ) : (
          <div className="tblw">
            <table className="tbl">
              <thead><tr><th>Form</th><th>Status</th><th className="r">Submissions · 30d</th><th className="r">All time</th><th>Last submission</th><th>Updated</th></tr></thead>
              <tbody>
                {forms.map(({ f, total, last30, lastAt }) => (
                  <tr key={f.id}>
                    <td><Link className="rl" href={`/ase/leads/forms/${f.id}`}>{f.name}</Link><div className="subtle sm">{(f.fields as { type?: string }[]).filter((x) => x.type !== "break").length} fields</div></td>
                    <td>{f.archivedAt ? <Pill status="Inactive" label="Archived" /> : f.status === "published" ? <Pill status="Live" label="Published" /> : <Pill status="draft" label="Draft" />}</td>
                    <td className="r">{last30}</td><td className="r">{total}</td>
                    <td className="muted">{lastAt ? relTime(new Date(lastAt)) : "—"}</td>
                    <td className="muted">{fmtDate(f.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
