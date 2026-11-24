/** Open tracking: a 1×1 transparent GIF. Counts are approximate (mail apps preload or block images). */
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { recipientByToken } from "@/lib/email/server";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const r = await recipientByToken(token);
    if (r && r.status === "sent") {
      const R = schema.emailRecipients;
      await db.update(R).set({ openCount: dsql`${R.openCount} + 1`, firstOpenedAt: dsql`coalesce(${R.firstOpenedAt}, now())` }).where(eq(R.id, r.id));
    }
  } catch (err) { console.error("[email] open", (err as Error).message); }
  return new Response(GIF, { headers: { "content-type": "image/gif", "content-length": String(GIF.length), "cache-control": "no-store, private" } });
}
