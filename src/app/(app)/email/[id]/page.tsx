import { notFound } from "next/navigation";
import { asc, desc, eq, isNull, ne, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { newsletterMailProblems } from "@/lib/mail";
import { typedCampaign } from "@/lib/email/server";
import { Builder } from "./Builder";

export const metadata = { title: "Newsletter" };

export default async function NewsletterEditor({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("campaigns.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await db.query.emailCampaigns.findFirst({ where: eq(schema.emailCampaigns.id, id) });
  if (!row) notFound();
  const c = typedCampaign(row);
  const R = schema.emailRecipients;
  const hasReport = c.status === "sending" || c.status === "sent" || c.status === "cancelled";

  const [g, mail, owners, forms, counts, links, recipients] = await Promise.all([
    getSetting("general"), getSetting("email"),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(ne(schema.users.status, "disabled")).orderBy(asc(schema.users.name)),
    db.select({ id: schema.leadForms.id, name: schema.leadForms.name }).from(schema.leadForms).where(isNull(schema.leadForms.archivedAt)).orderBy(asc(schema.leadForms.name)),
    hasReport ? db.select({
      total: dsql<number>`count(*)::int`,
      sent: dsql<number>`count(*) filter (where ${R.status} = 'sent')::int`,
      failed: dsql<number>`count(*) filter (where ${R.status} = 'failed')::int`,
      skipped: dsql<number>`count(*) filter (where ${R.status} = 'skipped')::int`,
      waiting: dsql<number>`count(*) filter (where ${R.status} in ('queued','sending'))::int`,
      opened: dsql<number>`count(*) filter (where ${R.firstOpenedAt} is not null)::int`,
      clicked: dsql<number>`count(*) filter (where ${R.firstClickedAt} is not null)::int`,
      unsubscribed: dsql<number>`count(*) filter (where ${R.unsubscribedAt} is not null)::int`,
    }).from(R).where(eq(R.campaignId, id)) : Promise.resolve([]),
    hasReport ? db.select({ url: schema.emailLinks.url, clicks: schema.emailLinks.clickCount }).from(schema.emailLinks).where(eq(schema.emailLinks.campaignId, id)).orderBy(desc(schema.emailLinks.clickCount)) : Promise.resolve([]),
    hasReport ? db.select().from(R).where(eq(R.campaignId, id)).orderBy(dsql`${R.firstClickedAt} desc nulls last, ${R.firstOpenedAt} desc nulls last, ${R.email}`).limit(300) : Promise.resolve([]),
  ]);

  return (
    <Builder
      key={`${c.id}:${c.status}`}
      campaign={{
        id: c.id, name: c.name, subject: c.subject, preheader: c.preheader, fromName: c.fromName, replyTo: c.replyTo, blocks: c.blocks, style: c.style, audience: c.audience,
        status: c.status, scheduledAt: c.scheduledAt?.toISOString() ?? null, startedAt: c.startedAt?.toISOString() ?? null, finishedAt: c.finishedAt?.toISOString() ?? null,
        lastError: c.lastError, snapshotted: !!c.snapshotAt,
      }}
      owners={owners}
      forms={forms}
      mailProblems={newsletterMailProblems(mail)}
      mail={{ fromName: mail.fromName, fromAddress: mail.fromAddress, replyTo: mail.replyTo, postalAddress: mail.postalAddress, sendsPerMinute: mail.sendsPerMinute }}
      company={g.companyName}
      user={{ name: user.name, email: user.email }}
      report={hasReport && counts[0] ? {
        counts: counts[0], links,
        recipients: recipients.map((r) => ({ id: r.id, email: r.email, name: r.name, businessName: r.businessName, status: r.status, error: r.error, sentAt: r.sentAt?.toISOString() ?? null, opens: r.openCount, clicks: r.clickCount, unsubscribed: !!r.unsubscribedAt, leadId: r.leadId, merchantId: r.merchantId })),
      } : null}
    />
  );
}
