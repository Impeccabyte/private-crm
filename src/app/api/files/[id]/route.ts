/**
 * Download an uploaded file. Signed-in staff only, scoped like the lead it belongs to, and audited.
 * Always sent as an attachment (never rendered inline) with nosniff, so a crafted upload can't run in the CRM.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser, scopeOwnerIds, actorFor } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { get } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (!can(user.role, "leads.view")) return new Response("Not allowed", { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const file = await db.query.files.findFirst({ where: eq(schema.files.id, id) });
  if (!file?.leadId) return new Response("Not found", { status: 404 });
  const owners = await scopeOwnerIds(user);
  if (owners) {
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, file.leadId), columns: { ownerId: true } });
    if (!lead?.ownerId || !owners.includes(lead.ownerId)) return new Response("Not found", { status: 404 });
  }
  // Only files the scanner passed (or uploaded before scanning existed) can be downloaded.
  if (file.scanStatus === "pending") return new Response("This file is still being virus-scanned. Try again in a minute.", { status: 409 });
  if (file.scanStatus === "infected") return new Response(`This file was blocked: the virus scanner found ${file.scanResult ?? "a threat"}.`, { status: 410 });
  if (file.scanStatus === "error") return new Response("This file couldn’t be scanned, so it can’t be downloaded.", { status: 409 });
  let data: Buffer;
  try { data = await get(file.storageKey); } catch (err) {
    console.error("[files] read failed", file.id, (err as Error).message);
    return new Response("This file couldn’t be read.", { status: 500 });
  }
  await audit(await actorFor(user), "file.download", "file", file.id, { name: file.originalName, leadId: file.leadId });
  const ascii = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(data.length),
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
