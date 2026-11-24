/**
 * Server side of newsletters: loading campaigns, public link addresses, unsubscribes and the image store.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken } from "@/lib/crypto";
import { uploadDir } from "@/lib/files";
import { scanBuffer, scannerConfigured } from "@/lib/clamav";
import { DEFAULT_AUDIENCE, type Audience, type Block, type Brand, type EmailStyle } from "./types";
import { normalStyle } from "./render";

export type CampaignRow = typeof schema.emailCampaigns.$inferSelect;
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export type TypedCampaign = Omit<CampaignRow, "blocks" | "style" | "audience" | "status"> & { blocks: Block[]; style: EmailStyle; audience: Audience; status: CampaignStatus };

export const typedCampaign = (c: CampaignRow): TypedCampaign => {
  const a = (c.audience ?? {}) as Partial<Audience>;
  return {
    ...c, status: c.status as CampaignStatus, blocks: (c.blocks as Block[]) ?? [], style: normalStyle(c.style as Partial<EmailStyle>),
    audience: { leads: { ...DEFAULT_AUDIENCE.leads, ...a.leads }, merchants: { ...DEFAULT_AUDIENCE.merchants, ...a.merchants } },
  };
};

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const newRecipientToken = () => randomToken(18);
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export const publicUrls = (token: string) => ({
  unsubscribe: `${appUrl()}/e/u/${token}`,
  view: `${appUrl()}/e/v/${token}`,
  pixel: `${appUrl()}/e/o/${token}`,
  click: (linkId: string) => `${appUrl()}/e/c/${token}/${linkId}`,
});

export async function recipientByToken(token: string) {
  if (!TOKEN.test(token)) return null;
  return (await db.query.emailRecipients.findFirst({ where: eq(schema.emailRecipients.token, token) })) ?? null;
}

/** Adds the address to the do-not-email list and marks the recipient. Safe to call more than once. */
export async function unsubscribe(r: { id: string; email: string; campaignId: string }) {
  await db.insert(schema.emailSuppressions).values({ email: r.email, reason: "unsubscribed", campaignId: r.campaignId }).onConflictDoNothing();
  await db.update(schema.emailRecipients).set({ unsubscribedAt: dsql`coalesce(${schema.emailRecipients.unsubscribedAt}, now())` }).where(eq(schema.emailRecipients.id, r.id));
}

/** Undo for someone who unsubscribed by mistake. Only lifts an "unsubscribed" entry, never a rejected or manual one. */
export async function resubscribe(r: { id: string; email: string }) {
  await db.delete(schema.emailSuppressions).where(dsql`${schema.emailSuppressions.email} = ${r.email} and ${schema.emailSuppressions.reason} = 'unsubscribed'`);
  await db.update(schema.emailRecipients).set({ unsubscribedAt: null }).where(eq(schema.emailRecipients.id, r.id));
}

// ── Newsletter images: public and unencrypted, because email apps load them without signing in ──
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_KEY = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;
const imageDir = () => path.join(uploadDir(), "email-images");

/** Detects the real image type from its first bytes; null for anything else (SVG is refused on purpose). */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (/^GIF8[79]a/.test(buf.subarray(0, 6).toString("latin1"))) return { mime: "image/gif", ext: "gif" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export class ImageRefused extends Error {}

export async function saveImage(data: Buffer, userId: string): Promise<{ id: string; url: string }> {
  if (!data.length) throw new ImageRefused("That file is empty.");
  if (data.length > MAX_IMAGE_BYTES) throw new ImageRefused("Pictures can be up to 2 MB. Try a smaller or more compressed one.");
  const kind = sniffImage(data);
  if (!kind) throw new ImageRefused("Use a PNG, JPG, GIF or WebP picture.");
  if (scannerConfigured()) {
    const r = await scanBuffer(data); // throws ScannerUnavailable; the caller turns that into "try again"
    if (r.status === "infected") throw new ImageRefused("That file didn’t pass our security scan.");
  }
  const id = randomUUID(), storageKey = `${id}.${kind.ext}`;
  await mkdir(imageDir(), { recursive: true });
  await writeFile(path.join(imageDir(), storageKey), data, { mode: 0o644 });
  await db.insert(schema.emailImages).values({ id, mimeType: kind.mime, size: data.length, sha256: createHash("sha256").update(data).digest("hex"), storageKey, createdById: userId });
  return { id, url: `${appUrl()}/e/img/${id}` };
}

export async function readImage(id: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const row = await db.query.emailImages.findFirst({ where: eq(schema.emailImages.id, id) });
  if (!row || !IMAGE_KEY.test(row.storageKey)) return null;
  try { return { data: await readFile(path.join(imageDir(), row.storageKey)), mime: row.mimeType }; } catch { return null; }
}

// ── Rendering one recipient's copy ───────────────────────────────────────────
export type SendContext = { companyName: string; postalAddress: string; brand: Brand; /** url → email_links.id */ links: Map<string, string> };

export async function sendContext(campaignId: string): Promise<SendContext> {
  const { getSetting } = await import("@/lib/settings");
  const [g, mail, brand, links] = await Promise.all([
    getSetting("general"), getSetting("email"), getSetting("brand"),
    db.select({ id: schema.emailLinks.id, url: schema.emailLinks.url }).from(schema.emailLinks).where(eq(schema.emailLinks.campaignId, campaignId)),
  ]);
  return { companyName: g.companyName, postalAddress: mail.postalAddress, brand, links: new Map(links.map((l) => [l.url, l.id])) };
}

export async function renderForRecipient(c: TypedCampaign, r: { token: string; name: string | null; businessName: string | null }, ctx: SendContext, opts: { pixel: boolean }) {
  const { renderEmail } = await import("./render");
  const u = publicUrls(r.token);
  const name = (r.name ?? "").trim();
  return renderEmail(c, {
    merge: { first_name: name.split(/\s+/)[0] ?? "", name, business_name: r.businessName ?? "" },
    companyName: ctx.companyName, postalAddress: ctx.postalAddress, brand: ctx.brand,
    unsubscribeUrl: u.unsubscribe, viewUrl: u.view, pixelUrl: opts.pixel ? u.pixel : undefined,
    link: (url) => { const id = ctx.links.get(url); return id ? u.click(id) : url; },
  });
}
