/**
 * Profile photos. The browser crops and re-encodes the picture to a small square (see AvatarEditor), and the
 * server still checks what it gets: JPEG, PNG or WebP by content, a tight size cap, and a virus scan when ClamAV
 * is configured. Stored encrypted through src/lib/files.ts like every other upload; users.avatar_key points at it.
 */
import "server-only";
import { eq, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { get, put, remove } from "./files";
import { scanBuffer, scannerConfigured } from "./clamav";

/** Pixel size the browser resizes to. */
export const AVATAR_PX = 256;
/** A 256px WebP/JPEG is ~10–40 KB; this leaves room while staying well under the 1 MB Server Action limit. */
export const AVATAR_MAX_BYTES = 512 * 1024;

export class AvatarRefused extends Error {}

function sniffAvatar(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Saves a new photo for this user and deletes the one it replaces. Returns the new storage key. */
export async function setAvatar(userId: string, data: Buffer): Promise<string> {
  if (!data.length) throw new AvatarRefused("That file is empty.");
  if (data.length > AVATAR_MAX_BYTES) throw new AvatarRefused("That photo is too large. Try a smaller one.");
  if (!sniffAvatar(data)) throw new AvatarRefused("Use a JPG, PNG or WebP photo.");
  if (scannerConfigured()) {
    const r = await scanBuffer(data); // throws ScannerUnavailable; the caller turns that into "try again"
    if (r.status === "infected") throw new AvatarRefused("That file didn’t pass our security scan.");
  }
  const { storageKey } = await put(data);
  const old = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { avatarKey: true } });
  await db.update(schema.users).set({ avatarKey: storageKey }).where(eq(schema.users.id, userId));
  if (old?.avatarKey) await remove(old.avatarKey).catch((e) => console.error("[avatars] couldn’t delete old photo", (e as Error).message));
  return storageKey;
}

/** Removes this user's photo (they go back to initials). Returns false when there was none. */
export async function clearAvatar(userId: string): Promise<boolean> {
  const old = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { avatarKey: true } });
  if (!old?.avatarKey) return false;
  await db.update(schema.users).set({ avatarKey: null }).where(eq(schema.users.id, userId));
  await remove(old.avatarKey).catch((e) => console.error("[avatars] couldn’t delete photo", (e as Error).message));
  return true;
}

/**
 * Reads a photo by the id in its address. Only keys some user currently has as their avatar are readable here,
 * so this can never be used to fetch other uploads (lead files) from the same store.
 */
export async function readAvatar(id: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  const row = await db.query.users.findFirst({ where: like(schema.users.avatarKey, `%/${id}.bin`), columns: { avatarKey: true } });
  if (!row?.avatarKey) return null;
  const data = await get(row.avatarKey);
  const mime = sniffAvatar(data);
  return mime ? { data, mime } : null;
}
