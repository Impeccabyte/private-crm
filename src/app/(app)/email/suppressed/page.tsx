import { desc, eq } from "drizzle-orm";
import { Ban } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { fmtDate } from "@/lib/format";
import { Empty, PageHeader, Pill, type Tone } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { addSuppression } from "../actions";
import { RemoveSuppression } from "./RemoveSuppression";

export const metadata = { title: "Do-not-email list" };

const REASON: Record<string, { label: string; tone: Tone }> = {
  unsubscribed: { label: "Unsubscribed", tone: "gray" }, rejected: { label: "Rejected by mail server", tone: "red" }, manual: { label: "Added by hand", tone: "neutral" },
};

export default async function SuppressedPage() {
  await requirePage("campaigns.manage");
  const S = schema.emailSuppressions;
  const rows = await db.select({ s: S, campaign: schema.emailCampaigns.name }).from(S).leftJoin(schema.emailCampaigns, eq(S.campaignId, schema.emailCampaigns.id)).orderBy(desc(S.createdAt)).limit(1000);
  return (
    <div className="content">
      <PageHeader title="Do-not-email list" crumbs={[{ href: "/email", label: "Email" }, { label: "Do-not-email list" }]}
        sub="These addresses are left out of every newsletter. People who unsubscribe are added automatically." />
      <section className="card">
        <div className="card-h"><h2>Add an address</h2></div>
        <div className="card-b">
          <ActionForm action={addSuppression} submitLabel="Add to list" resetOnOk className="stack">
            <Field label="Email address" name="email" hint="Use this when someone asks by phone or reply not to be emailed."><input id="email" name="email" type="email" className="inp" style={{ maxWidth: 360 }} autoComplete="off" /></Field>
          </ActionForm>
        </div>
      </section>
      <section className="card lv" aria-label="Addresses">
        {rows.length === 0 ? (
          <Empty icon={Ban} title="Nobody is on the list">Unsubscribes and addresses your mail server rejects will show up here.</Empty>
        ) : (
          <div className="tblw">
            <table className="tbl">
              <thead><tr><th>Email</th><th>Why</th><th>From newsletter</th><th>Added</th><th className="w0"><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(({ s, campaign }) => {
                  const r = REASON[s.reason] ?? REASON.manual!;
                  return (
                    <tr key={s.email}>
                      <td>{s.email}{s.detail && <div className="subtle sm">{s.detail}</div>}</td>
                      <td><Pill status={s.reason} label={r.label} tone={r.tone} /></td>
                      <td className="muted">{campaign ?? "—"}</td>
                      <td className="muted">{fmtDate(s.createdAt)}</td>
                      <td className="w0"><RemoveSuppression email={s.email} reason={s.reason} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
