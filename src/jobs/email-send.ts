/**
 * Sends newsletters. Runs every minute in the worker and sends up to "send rate per minute" messages per round.
 *
 * Never sends twice: a recipient row is claimed (queued → sending) in the database *before* the mail server is
 * contacted. If the worker dies mid-send, that row stays "sending" and is later marked failed rather than re-sent.
 */
import { and, asc, eq, inArray, lt, lte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { newsletterMailProblems, sendMailRich } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { resolveAudience } from "@/lib/email/audience";
import { collectLinks, mergeTags } from "@/lib/email/render";
import { newRecipientToken, publicUrls, renderForRecipient, sendContext, typedCampaign, type TypedCampaign } from "@/lib/email/server";

const C = schema.emailCampaigns, R = schema.emailRecipients;
const STUCK_MS = 15 * 60_000;

/** Copies the audience into email_recipients and records the links. Safe to repeat if interrupted. */
async function snapshot(c: TypedCampaign) {
  const { members } = await resolveAudience(c.audience);
  for (let i = 0; i < members.length; i += 500) {
    await db.insert(R).values(members.slice(i, i + 500).map((m) => ({ campaignId: c.id, email: m.email, name: m.name, businessName: m.businessName, leadId: m.leadId, merchantId: m.merchantId, token: newRecipientToken() }))).onConflictDoNothing();
  }
  const links = collectLinks(c.blocks);
  if (links.length) await db.insert(schema.emailLinks).values(links.map((url) => ({ campaignId: c.id, url }))).onConflictDoNothing();
  await db.update(C).set({ snapshotAt: new Date() }).where(eq(C.id, c.id));
  return members.length;
}

async function finish(c: TypedCampaign) {
  const done = await db.update(C).set({ status: "sent", finishedAt: new Date(), lastError: null }).where(and(eq(C.id, c.id), eq(C.status, "sending"))).returning({ id: C.id });
  if (!done.length) return;
  // One timeline entry per lead / merchant that was actually sent to.
  await db.execute(dsql`insert into activities (type, title, body, lead_id, merchant_id, source, tag)
    select 'email', ${`Newsletter sent: ${c.name}`.slice(0, 300)}, ${`Subject: ${mergeTags(c.subject, {})}`.slice(0, 400)}, lead_id, merchant_id, 'internal', 'newsletter'
    from email_recipients where campaign_id = ${c.id} and status = 'sent' and (lead_id is not null or merchant_id is not null)`);
  const [n] = await db.select({
    sent: dsql<number>`count(*) filter (where ${R.status} = 'sent')::int`,
    failed: dsql<number>`count(*) filter (where ${R.status} = 'failed')::int`,
    skipped: dsql<number>`count(*) filter (where ${R.status} = 'skipped')::int`,
  }).from(R).where(eq(R.campaignId, c.id));
  await audit(null, "campaign.sent", "email_campaign", c.id, { name: c.name, ...n });
}

export async function runEmailRound() {
  const now = new Date();
  await db.update(C).set({ status: "sending", startedAt: now }).where(and(eq(C.status, "scheduled"), lte(C.scheduledAt, now)));
  const active = await db.select().from(C).where(eq(C.status, "sending")).orderBy(asc(C.startedAt));
  const stats = { campaigns: active.length, sent: 0, failed: 0, skipped: 0, stopped: null as string | null };
  if (!active.length) return stats;

  const mail = await getSetting("email");
  const problems = newsletterMailProblems(mail);
  let budget = Math.max(1, mail.sendsPerMinute);

  for (const row of active) {
    const c = typedCampaign(row);
    if (problems.length) { await db.update(C).set({ lastError: problems[0]! }).where(eq(C.id, c.id)); stats.stopped = problems[0]!; continue; }
    if (!c.snapshotAt) await snapshot(c);

    await db.update(R).set({ status: "failed", error: "Interrupted while sending. Not retried, so it can’t arrive twice." })
      .where(and(eq(R.campaignId, c.id), eq(R.status, "sending"), lt(R.claimedAt, new Date(Date.now() - STUCK_MS))));

    if (budget > 0) {
      const claimed = await db.update(R).set({ status: "sending", claimedAt: new Date() })
        .where(inArray(R.id, db.select({ id: R.id }).from(R).where(and(eq(R.campaignId, c.id), eq(R.status, "queued"))).orderBy(asc(R.id)).limit(budget).for("update", { skipLocked: true })))
        .returning();
      budget -= claimed.length;
      const ctx = await sendContext(c.id);
      const suppressed = new Set(claimed.length ? (await db.select({ email: schema.emailSuppressions.email }).from(schema.emailSuppressions).where(inArray(schema.emailSuppressions.email, claimed.map((r) => r.email)))).map((s) => s.email) : []);

      for (let i = 0; i < claimed.length; i++) {
        const r = claimed[i]!;
        // Stop at once if the newsletter was cancelled part-way through.
        if (i % 20 === 0) {
          const cur = await db.query.emailCampaigns.findFirst({ where: eq(C.id, c.id), columns: { status: true } });
          if (cur?.status !== "sending") {
            await db.update(R).set({ status: "skipped", error: "Sending was cancelled.", claimedAt: null }).where(inArray(R.id, claimed.slice(i).map((x) => x.id)));
            stats.skipped += claimed.length - i;
            break;
          }
        }
        if (suppressed.has(r.email)) {
          await db.update(R).set({ status: "skipped", error: "Unsubscribed or blocked before sending." }).where(eq(R.id, r.id));
          stats.skipped++;
          continue;
        }
        const out = await renderForRecipient(c, r, ctx, { pixel: true });
        const u = publicUrls(r.token);
        const res = await sendMailRich({
          to: r.email, subject: out.subject, text: out.text, html: out.html, fromName: c.fromName || undefined, replyTo: c.replyTo || undefined,
          headers: { "List-Unsubscribe": `<${u.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "X-Campaign": c.id },
        }, { pool: true });

        if (res.ok) {
          await db.update(R).set({ status: "sent", sentAt: new Date(), error: null }).where(eq(R.id, r.id));
          stats.sent++;
        } else if (res.kind === "transient") {
          // Couldn't reach or log in to the mail server: nothing went out, so put this and the rest back and try next minute.
          await db.update(R).set({ status: "queued", claimedAt: null }).where(inArray(R.id, claimed.slice(i).map((x) => x.id)));
          await db.update(C).set({ lastError: `Couldn’t reach the mail server: ${res.error ?? "unknown error"}`.slice(0, 300) }).where(eq(C.id, c.id));
          stats.stopped = res.error ?? "mail server unreachable";
          return stats;
        } else {
          await db.update(R).set({ status: "failed", error: (res.error ?? "Send failed").slice(0, 300) }).where(eq(R.id, r.id));
          if (res.kind === "rejected") await db.insert(schema.emailSuppressions).values({ email: r.email, reason: "rejected", detail: (res.error ?? "").slice(0, 300), campaignId: c.id }).onConflictDoNothing();
          stats.failed++;
        }
      }
      if (claimed.length) await db.update(C).set({ lastError: null }).where(and(eq(C.id, c.id), eq(C.status, "sending")));
    }

    const [left] = await db.select({ n: dsql<number>`count(*)::int` }).from(R).where(and(eq(R.campaignId, c.id), inArray(R.status, ["queued", "sending"])));
    if ((left?.n ?? 0) === 0) await finish(c);
  }
  return stats;
}
