/**
 * Click tracking. Redirects only to a link stored when the newsletter was sent (looked up by id), never to an
 * address taken from the request, so these URLs can't be abused to redirect people to arbitrary sites.
 */
import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { recipientByToken } from "@/lib/email/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string; linkId: string }> }) {
  const { token, linkId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(linkId)) return new Response("Not found", { status: 404 });
  const L = schema.emailLinks, R = schema.emailRecipients;
  const link = await db.query.emailLinks.findFirst({ where: eq(L.id, linkId) });
  if (!link || !/^https?:\/\//i.test(link.url)) return new Response("Not found", { status: 404 });
  try {
    const r = await recipientByToken(token);
    if (r && r.campaignId === link.campaignId) {
      await db.update(L).set({ clickCount: dsql`${L.clickCount} + 1` }).where(eq(L.id, link.id));
      // A click proves the email was opened, even if images were blocked.
      await db.update(R).set({ clickCount: dsql`${R.clickCount} + 1`, firstClickedAt: dsql`coalesce(${R.firstClickedAt}, now())`, firstOpenedAt: dsql`coalesce(${R.firstOpenedAt}, now())`, openCount: dsql`greatest(${R.openCount}, 1)` }).where(and(eq(R.id, r.id)));
    }
  } catch (err) { console.error("[email] click", (err as Error).message); }
  return new Response(null, { status: 302, headers: { location: link.url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
