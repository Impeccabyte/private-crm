/**
 * A user's profile photo. Signed-in users only (anyone in the CRM can see colleagues' photos).
 * Sent inline with its checked image type, nosniff and a locked-down CSP. Each upload has a new address,
 * so the browser may keep it privately for a long time.
 */
import { getCurrentUser } from "@/lib/dal";
import { readAvatar } from "@/lib/avatars";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  let photo;
  try { photo = await readAvatar(id); } catch (err) {
    console.error("[avatars] read failed", id, (err as Error).message);
    return new Response("This photo couldn’t be read.", { status: 500 });
  }
  if (!photo) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.mime,
      "content-length": String(photo.data.length),
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
