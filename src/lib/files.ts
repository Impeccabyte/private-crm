/**
 * Uploaded file storage. Files are encrypted at rest (AES-256-GCM, APP_ENCRYPTION_KEY) and written under
 * UPLOAD_DIR (a Docker volume in Compose). Only this module touches the disk, so moving to S3 or similar later
 * means replacing put()/get() here.
 *
 * On-disk format: "IBF1" | iv (12 bytes) | auth tag (16 bytes) | ciphertext.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAGIC = Buffer.from("IBF1");

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  return Buffer.from(raw, "base64");
}

export const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || "./uploads");

export async function put(data: Buffer): Promise<{ storageKey: string; sha256: string }> {
  const now = new Date();
  const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.bin`;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  const file = path.join(uploadDir(), storageKey);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]), { mode: 0o600 });
  return { storageKey, sha256: createHash("sha256").update(data).digest("hex") };
}

const validKey = (k: string) => /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.bin$/.test(k);

/** Deletes the stored content (used when a file turns out to be infected). */
export async function remove(storageKey: string) {
  if (!validKey(storageKey)) throw new Error("Bad storage key");
  await unlink(path.join(uploadDir(), storageKey)).catch((e) => { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; });
}

export async function get(storageKey: string): Promise<Buffer> {
  if (!validKey(storageKey)) throw new Error("Bad storage key");
  const raw = await readFile(path.join(uploadDir(), storageKey));
  if (!raw.subarray(0, 4).equals(MAGIC)) throw new Error("Unrecognized file format");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(4, 16));
  d.setAuthTag(raw.subarray(16, 32));
  return Buffer.concat([d.update(raw.subarray(32)), d.final()]);
}

// ── What we accept: checked by content, not just the file name ────────────────
export const ACCEPT_LABEL = "PDF, JPG, PNG, HEIC, CSV or Excel";
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.csv,.xlsx,.xls,application/pdf,image/jpeg,image/png,image/heic,image/heif,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 26 * 1024 * 1024;

/** Detects the real type from the first bytes; returns null for anything we don't accept. */
export function sniff(buf: Buffer, name: string): { mime: string; ext: string } | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const head = buf.subarray(0, 16);
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return { mime: "image/png", ext: "png" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  const ftyp = head.subarray(4, 12).toString("latin1");
  if (/^ftyp(heic|heix|hevc|mif1|msf1)/.test(ftyp)) return { mime: "image/heic", ext: "heic" };
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04 && ext === "xlsx") return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  if (head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && ext === "xls") return { mime: "application/vnd.ms-excel", ext: "xls" };
  if (ext === "csv" && !buf.subarray(0, 8192).includes(0)) return { mime: "text/csv", ext: "csv" };
  return null;
}

/** Keeps a readable, safe display name (no paths or control characters). */
export function cleanName(name: string, ext: string) {
  const base = (name.split(/[\\/]/).pop() ?? "file").replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
}

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
