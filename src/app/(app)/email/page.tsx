import Link from "next/link";
import { desc, eq, sql as dsql } from "drizzle-orm";
import { Ban, LayoutTemplate, Mail, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { newsletterMailProblems } from "@/lib/mail";
import { fmtDate, fmtDateTime, num, pct } from "@/lib/format";
import { Banner, Empty, PageHeader, Pill, type Tone } from "@/components/ui";
import { createCampaign } from "./actions";
import { TemplateRow } from "./TemplateRow";

export const metadata = { title: "Email" };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Scheduled", tone: "amber" }, sending: { label: "Sending", tone: "blue" },
  sent: { label: "Sent", tone: "green" }, cancelled: { label: "Stopped", tone: "gray" },
};
const VIEWS = [{ key: "", label: "All" }, { key: "draft", label: "Drafts" }, { key: "scheduled", label: "Scheduled" }, { key: "sent", label: "Sent" }];

export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("campaigns.manage");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : "";
  const C = schema.emailCampaigns;
  const n = (cond: string) => dsql<number>`(select count(*)::int from email_recipients r where r.campaign_id = "email_campaigns"."id"${dsql.raw(cond)})`;
  const [rows, templates, mail, suppressed] = await Promise.all([
    db.select({ c: C, total: n(""), sent: n(" and r.status = 'sent'"), opened: n(" and r.first_opened_at is not null"), clicked: n(" and r.first_clicked_at is not null") })
      .from(C).where(view === "sent" ? dsql`${C.status} in ('sent','sending','cancelled')` : view ? eq(C.status, view) : undefined).orderBy(desc(C.updatedAt)).limit(200),
    db.select().from(schema.emailTemplates).orderBy(desc(schema.emailTemplates.createdAt)),
    getSetting("email"),
    db.select({ n: dsql<number>`count(*)::int` }).from(schema.emailSuppressions),
  ]);
  const problems = newsletterMailProblems(mail);
  const newBlank = <form action={createCampaign.bind(null, null)}><button className="btn pri" type="submit"><Plus size={16} aria-hidden="true" />New newsletter</button></form>;

  return (
    <div className="content">
      <PageHeader title="Email" sub="Design a newsletter, pick who gets it, and send it now or later."
        actions={<><Link className="btn" href="/email/suppressed"><Ban size={16} aria-hidden="true" />Do-not-email list{suppressed[0]?.n ? ` · ${num(suppressed[0].n)}` : ""}</Link>{newBlank}</>} />
      {problems.length > 0 && (
        <Banner tone="amber" title="Finish your mail settings before sending">
          {problems.join(" ")} <Link href="/settings/email">Open Settings → Email</Link>
        </Banner>
      )}
      <section className="card lv" aria-label="Newsletters">
        <div className="lt">
          <div className="views">
            {VIEWS.map((v) => <Link key={v.key} href={v.key ? `/email?view=${v.key}` : "/email"} className={`vt ${view === v.key ? "on" : ""}`}>{v.label}</Link>)}
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty icon={Mail} title={view ? "Nothing here yet" : "No newsletters yet"} actions={view ? undefined : newBlank}>
            {view ? "Newsletters with this status show up here." : "Start with a simple layout, drag in the blocks you need, then choose which leads and merchants get it."}
          </Empty>
        ) : (
          <div className="tblw">
            <table className="tbl">
              <thead><tr><th>Newsletter</th><th>Status</th><th className="r">Recipients</th><th className="r">Opened</th><th className="r">Clicked</th><th>When</th></tr></thead>
              <tbody>
                {rows.map(({ c, total, sent, opened, clicked }) => {
                  const s = STATUS[c.status] ?? STATUS.draft!;
                  const done = c.status !== "draft" && c.status !== "scheduled";
                  return (
                    <tr key={c.id}>
                      <td><Link className="rl" href={`/email/${c.id}`}>{c.name}</Link><div className="subtle sm">{c.subject || "No subject yet"}</div></td>
                      <td><Pill status={c.status} label={s.label} tone={s.tone} /></td>
                      <td className="r">{done ? (c.status === "sending" ? `${num(sent)} of ${num(total)}` : num(sent)) : "—"}</td>
                      <td className="r">{done && sent ? pct((opened / sent) * 100, 0) : "—"}</td>
                      <td className="r">{done && sent ? pct((clicked / sent) * 100, 0) : "—"}</td>
                      <td className="muted">{c.status === "scheduled" && c.scheduledAt ? `Sends ${fmtDateTime(c.scheduledAt)} ET` : done && c.startedAt ? `Sent ${fmtDate(c.startedAt)}` : `Edited ${fmtDate(c.updatedAt)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {templates.length > 0 && (
        <section className="card" aria-labelledby="tpl-h">
          <div className="card-h"><h2 id="tpl-h">Saved templates</h2><span className="subtle sm">Start a new newsletter from a design you saved</span></div>
          <ul className="em-tpls">
            {templates.map((t) => (
              <li key={t.id}>
                <LayoutTemplate size={16} aria-hidden="true" />
                <span className="n">{t.name}<span className="subtle sm"> · {(t.blocks as unknown[]).length} blocks · saved {fmtDate(t.createdAt)}</span></span>
                <TemplateRow id={t.id} name={t.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
