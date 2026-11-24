/** "View in browser": this recipient's copy of the newsletter as a web page. */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { recipientByToken, renderForRecipient, sendContext, typedCampaign } from "@/lib/email/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await recipientByToken(token);
  const row = r && (await db.query.emailCampaigns.findFirst({ where: eq(schema.emailCampaigns.id, r.campaignId) }));
  if (!r || !row) return new Response("This email isn’t available.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const out = await renderForRecipient(typedCampaign(row), r, await sendContext(row.id), { pixel: false });
  return new Response(out.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex", "content-security-policy": "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
