/**
 * Field-level encryption for EINs, bank numbers and integration secrets (AES-256-GCM).
 * Key: APP_ENCRYPTION_KEY (32 bytes, base64). In production, swap the key source for a cloud KMS
 * data key (envelope encryption) — callers only use encrypt()/decrypt().
 * Ciphertext format: v1.<iv b64>.<tag b64>.<ciphertext b64>
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

export const encryptOrNull = (v?: string | null) => (v ? encrypt(v) : null);
export const decryptOrNull = (v?: string | null) => (v ? decrypt(v) : null);

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const last4 = (v?: string | null) => (v ? v.replace(/\D/g, "").slice(-4) : null);
export const maskEin = (l4?: string | null) => (l4 ? `••-•••${l4}` : "—");
export const maskAccount = (l4?: string | null) => (l4 ? `•••• ${l4}` : "—");
