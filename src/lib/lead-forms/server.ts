/**
 * Server side of lead forms: loading, anti-spam token, embed-domain rules, and turning a submission into a lead.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { sendMail } from "@/lib/mail";
import { fmtBytes, put } from "@/lib/files";
import { scoreFit, scoreSource, scoreVolume } from "@/lib/leads";
import { DEFAULT_SETTINGS, parseVolume, type FormField, type FormSettings } from "./types";

export type LeadForm = typeof schema.leadForms.$inferSelect;
export type TypedForm = Omit<LeadForm, "fields" | "settings"> & { fields: FormField[]; settings: FormSettings };

export const typed = (f: LeadForm): TypedForm => ({ ...f, fields: (f.fields as FormField[]) ?? [], settings: { ...DEFAULT_SETTINGS, ...((f.settings as Partial<FormSettings>) ?? {}) } });

export const newPublicId = () => randomBytes(9).toString("base64url");

export async function formByPublicId(publicId: string) {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(publicId)) return null;
  const f = await db.query.leadForms.findFirst({ where: eq(schema.leadForms.publicId, publicId) });
  return f ? typed(f) : null;
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// ── Anti-spam token: proves the form was loaded at least a couple of seconds before submitting ──
const key = () => process.env.APP_ENCRYPTION_KEY ?? "dev-only-key";
export function issueToken(publicId: string) {
  const at = Date.now().toString(36);
  const sig = createHmac("sha256", key()).update(`${publicId}.${at}`).digest("base64url").slice(0, 32);
  return `${at}.${sig}`;
}
export function checkToken(publicId: string, token: string): "ok" | "too_fast" | "expired" | "invalid" {
  const [at, sig] = (token ?? "").split(".");
  if (!at || !sig) return "invalid";
  const want = createHmac("sha256", key()).update(`${publicId}.${at}`).digest("base64url").slice(0, 32);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return "invalid";
  const age = Date.now() - parseInt(at, 36);
  if (age < 2_000) return "too_fast";
  if (age > 24 * 3_600_000) return "expired";
  return "ok";
}

export const ipHash = (ip: string | null) => (ip ? createHash("sha256").update(`${ip}|${key()}`).digest("hex").slice(0, 32) : null);

// ── Where a form may be embedded ─────────────────────────────────────────────
export function allowedDomains(s: FormSettings) {
  return s.allowedDomains.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
export function hostAllowed(host: string, domains: string[]) {
  if (!domains.length) return true;
  const h = host.toLowerCase();
  return domains.some((d) => (d.startsWith("*.") ? h === d.slice(2) || h.endsWith(d.slice(1)) : h === d));
}
/** CSP frame-ancestors value: any site when unrestricted, otherwise the listed domains (https, plus http for localhost). */
export function frameAncestors(s: FormSettings) {
  const d = allowedDomains(s);
  if (!d.length) return "*";
  return ["'self'", ...d.map((x) => (x.startsWith("localhost") ? `http://${x}` : `https://${x}`))].join(" ");
}

// ── Rate limiting ────────────────────────────────────────────────────────────
export async function rateLimited(formId: string, hash: string | null) {
  if (!hash) return false;
  const since10 = new Date(Date.now() - 10 * 60_000), since60 = new Date(Date.now() - 60 * 60_000);
  const [[perForm], [overall]] = await Promise.all([
    db.select({ n: count() }).from(schema.leadFormSubmissions).where(and(eq(schema.leadFormSubmissions.formId, formId), eq(schema.leadFormSubmissions.ipHash, hash), gte(schema.leadFormSubmissions.createdAt, since10))),
    db.select({ n: count() }).from(schema.leadFormSubmissions).where(and(eq(schema.leadFormSubmissions.ipHash, hash), gte(schema.leadFormSubmissions.createdAt, since60))),
  ]);
  return perForm!.n >= 5 || overall!.n >= 30;
}

// ── Submission → lead ────────────────────────────────────────────────────────
export type UploadIn = { fieldId: string; fieldLabel: string; name: string; mime: string; data: Buffer; scanStatus: "clean" | "pending" | "unscanned"; scanResult: string | null };

export async function recordSubmission(form: TypedForm, values: Record<string, string>, meta: { ipHash: string | null; userAgent: string | null; pageUrl: string | null }, uploads: UploadIn[] = []) {
  const by = (t: FormField["mapTo"]) => { const f = form.fields.find((x) => x.mapTo === t); return f ? values[f.id] ?? "" : ""; };
  const email = by("email").toLowerCase();
  const phone = by("phone");
  const contactName = by("contactName");
  const businessName = by("businessName") || contactName || email || phone || "Web form lead";
  let website = by("website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const volume = by("estMonthlyVolume") ? parseVolume(by("estMonthlyVolume")) : null;

  // Readable copy of every answer for the lead's timeline.
  const fileNote = (fid: string) => uploads.filter((u) => u.fieldId === fid).map((u) => `${u.name} (${fmtBytes(u.data.length)})`).join(", ");
  const answered = form.fields.filter((f) => (f.type === "file" ? fileNote(f.id) : values[f.id]));
  const answers = answered.map((f) => `${f.label}: ${f.type === "file" ? fileNote(f.id) : values[f.id]}`).join("\n");
  const data = Object.fromEntries(answered.map((f) => [f.label, f.type === "file" ? fileNote(f.id) : values[f.id]!]));

  // Same person submitting again → add to their open lead instead of creating a duplicate.
  const digits = phone.replace(/\D/g, "");
  const existing = email || digits.length >= 7
    ? (await db.select().from(schema.leads).where(and(eq(schema.leads.status, "open"), dsql`(${email ? dsql`lower(${schema.leads.email}) = ${email}` : dsql`false`} or ${digits.length >= 7 ? dsql`regexp_replace(coalesce(${schema.leads.phone},''), '\\D', '', 'g') = ${digits}` : dsql`false`})`)).limit(1))[0]
    : undefined;

  let leadId: string, outcome: "created" | "matched";
  if (existing) {
    leadId = existing.id; outcome = "matched";
    await db.update(schema.leads).set({
      contactName: existing.contactName ?? (contactName || null), email: existing.email ?? (email || null), phone: existing.phone ?? (phone || null),
      website: existing.website ?? (website || null), estMonthlyVolume: existing.estMonthlyVolume ?? volume,
      lastActivityAt: new Date(), lastActivityNote: `Submitted “${form.name}” again`,
    }).where(eq(schema.leads.id, existing.id));
  } else {
    outcome = "created";
    const ownerId = form.settings.ownerId && (await db.query.users.findFirst({ where: and(eq(schema.users.id, form.settings.ownerId), eq(schema.users.status, "active")), columns: { id: true } })) ? form.settings.ownerId : null;
    const [lead] = await db.insert(schema.leads).values({
      businessName: businessName.slice(0, 200), contactName: contactName || null, email: email || null, phone: phone || null, website: website || null,
      source: "web_form", industry: by("industry") || null, estMonthlyVolume: volume, currentProcessor: by("currentProcessor") || null,
      scoreFit: scoreFit(null), scoreVolume: scoreVolume(volume), scoreSource: scoreSource("web_form"), scoreEngagement: 0,
      ownerId, formId: form.id, lastActivityAt: new Date(), lastActivityNote: `Submitted “${form.name}”`,
    }).returning({ id: schema.leads.id });
    leadId = lead!.id;
  }
  await db.insert(schema.activities).values({
    type: "note", title: outcome === "created" ? `Web form submitted: ${form.name}` : `Submitted ${form.name} again`,
    body: [answers, meta.pageUrl ? `\nFrom ${meta.pageUrl}` : ""].join(""), leadId, source: "internal",
  });
  const [sub] = await db.insert(schema.leadFormSubmissions).values({ formId: form.id, leadId, outcome, data, ipHash: meta.ipHash, userAgent: meta.userAgent?.slice(0, 300) ?? null, pageUrl: meta.pageUrl?.slice(0, 500) ?? null }).returning({ id: schema.leadFormSubmissions.id });
  for (const u of uploads) {
    const { storageKey, sha256 } = await put(u.data);
    await db.insert(schema.files).values({
      leadId, submissionId: sub!.id, formId: form.id, fieldId: u.fieldId, fieldLabel: u.fieldLabel, originalName: u.name, mimeType: u.mime, size: u.data.length, sha256, storageKey,
      scanStatus: u.scanStatus, scanResult: u.scanResult, scannedAt: u.scanStatus === "clean" ? new Date() : null, scanAttempts: u.scanStatus === "unscanned" ? 0 : 1,
    });
  }

  // Notifications (best effort; never fail the submission).
  const to = form.settings.notifyEmails.split(",").map((x) => x.trim()).filter(Boolean);
  if (to.length) {
    const g = await getSetting("general");
    const link = `${appUrl()}/ase/leads?lead=${leadId}`;
    for (const addr of to) {
      void sendMail(addr, `New ${form.name} submission: ${businessName}`, `${outcome === "matched" ? "An existing lead submitted again." : "A new lead came in."}\n\n${answers}\n\nOpen in ${g.companyName} CRM: ${link}`).catch(() => {});
    }
  }
  return { leadId, outcome };
}
