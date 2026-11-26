/**
 * The photo of the signed-in merchant's account manager, for the merchant portal.
 *
 * Takes no id from the request: the merchant comes from the portal session and the manager from that merchant's
 * owner, so a merchant can only ever load their own account manager's photo. (Staff photos at /api/avatars stay
 * staff-only.) The ?v= on the address only changes when the photo does, so the browser can keep it for a while.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPortalUser } from "@/lib/portal/dal";
import { readAvatarOf } from "@/lib/avatars";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getPortalUser();
  if (!u) return new Response("Sign in required", { status: 401, headers: { "cache-control": "no-store" } });
  const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, u.merchantId), columns: { ownerId: true } });
  let photo = null;
  try { photo = m?.ownerId ? await readAvatarOf(m.ownerId) : null; } catch (err) {
    console.error("[portal] manager photo read failed", (err as Error).message);
    return new Response("This photo couldn’t be read.", { status: 500, headers: { "cache-control": "no-store" } });
  }
  if (!photo) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.mime,
      "content-length": String(photo.data.length),
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
