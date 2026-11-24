/** Picture upload for the newsletter builder (signed-in, campaigns.manage). Returns the public address to use in the email. */
import { ForbiddenError, actorFor, requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { ScannerUnavailable } from "@/lib/clamav";
import { ImageRefused, MAX_IMAGE_BYTES, saveImage } from "@/lib/email/server";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  let user;
  try { user = await requirePermission("campaigns.manage"); } catch (e) { return json({ error: e instanceof ForbiddenError ? "You don’t have access to newsletters." : "Sign in again." }, 403); }
  // Same-origin only: a signed-in browser on another site must not be able to upload here.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return json({ error: "Upload from the newsletter builder." }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return json({ error: "Pictures can be up to 2 MB." }, 413);
  try {
    const f = (await req.formData()).get("file");
    if (!(f instanceof File)) return json({ error: "Choose a picture to upload." }, 400);
    const saved = await saveImage(Buffer.from(await f.arrayBuffer()), user.id);
    await audit(await actorFor(user), "campaign.image_upload", "email_image", saved.id, { name: f.name.slice(0, 120), size: f.size });
    return json(saved);
  } catch (e) {
    if (e instanceof ImageRefused) return json({ error: e.message }, 422);
    if (e instanceof ScannerUnavailable) return json({ error: "The virus scanner isn’t reachable right now, so pictures can’t be uploaded. Try again in a minute." }, 503);
    console.error("[email] image upload", e);
    return json({ error: "Couldn’t save that picture." }, 500);
  }
}
