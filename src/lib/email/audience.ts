/**
 * Works out who a newsletter goes to. Used for the live count in the builder and by the send job, which copies
 * the result into email_recipients when sending starts.
 */
import { and, eq, isNull, sql as dsql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Audience } from "./types";

export type AudienceMember = { email: string; name: string | null; businessName: string | null; leadId: string | null; merchantId: string | null };
export type AudienceResult = {
  members: AudienceMember[];
  /** Matched the filters but left out, and why. */
  excluded: { noEmail: number; invalid: number; duplicate: number; suppressed: number };
};

const VALID = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
const owner = (col: typeof schema.leads.ownerId | typeof schema.merchants.ownerId, v: string): SQL | undefined =>
  v === "any" ? undefined : v === "none" ? isNull(col) : eq(col, v);

export async function resolveAudience(a: Audience): Promise<AudienceResult> {
  const raw: (Omit<AudienceMember, "email"> & { email: string | null })[] = [];

  if (a.leads.on) {
    const L = schema.leads;
    const rows = await db.select({ id: L.id, email: L.email, name: L.contactName, businessName: L.businessName }).from(L).where(and(
      a.leads.status === "any" ? undefined : eq(L.status, a.leads.status),
      a.leads.source === "any" ? undefined : eq(L.source, a.leads.source),
      owner(L.ownerId, a.leads.ownerId),
      a.leads.formId === "any" ? undefined : eq(L.formId, a.leads.formId),
    ));
    for (const r of rows) raw.push({ email: r.email, name: r.name, businessName: r.businessName, leadId: r.id, merchantId: null });
  }

  if (a.merchants.on) {
    const M = schema.merchants;
    // A Primary or Owner contact with an email wins; otherwise the merchant's customer-service email.
    const contact = (col: string) => dsql<string | null>`(select ${dsql.raw(col)} from contacts c where c.merchant_id = "merchants"."id" and nullif(trim(c.email), '') is not null and c.labels && array['Primary','Owner']::text[] order by ('Primary' = any(c.labels)) desc, c.created_at limit 1)`;
    const rows = await db.select({
      id: M.id, businessName: M.dbaName, csEmail: M.csEmail,
      contactEmail: contact("c.email"), contactName: contact("trim(c.first_name || ' ' || c.last_name)"),
    }).from(M).where(and(
      isNull(M.hiddenAt), // hidden merchants never get newsletters
      a.merchants.status === "any" ? undefined : eq(M.status, a.merchants.status),
      owner(M.ownerId, a.merchants.ownerId),
    ));
    for (const r of rows) raw.push({ email: r.contactEmail ?? r.csEmail, name: r.contactEmail ? r.contactName : null, businessName: r.businessName, leadId: null, merchantId: r.id });
  }

  const suppressed = new Set((await db.select({ email: schema.emailSuppressions.email }).from(schema.emailSuppressions)).map((s) => s.email));
  const seen = new Set<string>();
  const members: AudienceMember[] = [];
  const excluded = { noEmail: 0, invalid: 0, duplicate: 0, suppressed: 0 };
  for (const r of raw) {
    const email = (r.email ?? "").trim().toLowerCase();
    if (!email) { excluded.noEmail++; continue; }
    if (!VALID.test(email) || email.length > 254) { excluded.invalid++; continue; }
    if (seen.has(email)) { excluded.duplicate++; continue; }
    seen.add(email);
    if (suppressed.has(email)) { excluded.suppressed++; continue; }
    members.push({ ...r, email });
  }
  return { members, excluded };
}

/** "Jordan Lee" → "Jordan". */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";
