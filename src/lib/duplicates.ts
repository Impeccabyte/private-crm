/**
 * Duplicate detection for leads and merchants: match on processor keys (MID) first, then EIN last 4,
 * phone, website domain and fuzzy business name (pg_trgm). Confidence tiers drive the UI:
 * high → block/merge prompt, medium → review, low → informational.
 */
import { and, eq, gt, ilike, inArray, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

export type DupInput = { name: string; phone?: string | null; website?: string | null; email?: string | null; einLast4?: string | null; mid?: string | null };
export type DupMatch = {
  kind: "merchant" | "lead"; id: string; name: string; confidence: "high" | "medium" | "low"; reasons: string[];
  fields: { label: string; value: string | null }[];
};

const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");
export function domainOf(s?: string | null): string | null {
  if (!s) return null;
  const v = s.includes("@") ? s.split("@")[1]! : s;
  try { return new URL(v.startsWith("http") ? v : `https://${v}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

export async function findDuplicates(input: DupInput, opts: { excludeLeadId?: string } = {}): Promise<DupMatch[]> {
  const name = input.name.trim();
  const phone = digits(input.phone).slice(-10);
  const domain = domainOf(input.website) ?? (input.email && !/gmail|yahoo|outlook|hotmail|icloud/i.test(input.email) ? domainOf(input.email) : null);
  const out = new Map<string, DupMatch>();

  // Merchants
  const merchants = await db.selectDistinctOn([schema.merchants.id], {
    id: schema.merchants.id, name: schema.merchants.dbaName, phone: schema.merchants.csPhone, website: schema.merchants.website, email: schema.merchants.csEmail,
    ein4: schema.legalEntities.einLast4, mid: schema.merchantAccounts.mid, status: schema.merchants.status, city: schema.merchants.city, street: schema.merchants.street,
    sim: dsql<number>`similarity(${schema.merchants.dbaName}, ${name})`,
  }).from(schema.merchants)
    .leftJoin(schema.legalEntities, eq(schema.merchants.legalEntityId, schema.legalEntities.id))
    .leftJoin(schema.merchantAccounts, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
    .where(or(
      name.length >= 3 ? gt(dsql`similarity(${schema.merchants.dbaName}, ${name})`, 0.35) : undefined,
      input.mid ? eq(schema.merchantAccounts.mid, digits(input.mid)) : undefined,
      input.einLast4 ? eq(schema.legalEntities.einLast4, input.einLast4) : undefined,
      phone.length === 10 ? dsql`right(regexp_replace(coalesce(${schema.merchants.csPhone},''), '\\D', '', 'g'), 10) = ${phone}` : undefined,
      domain ? or(ilike(schema.merchants.website, `%${domain}%`), ilike(schema.merchants.csEmail, `%@${domain}`)) : undefined,
    )).limit(20);

  for (const m of merchants) {
    const reasons: string[] = [];
    if (input.mid && m.mid === digits(input.mid)) reasons.push("MID");
    if (input.einLast4 && m.ein4 === input.einLast4) reasons.push("EIN last 4");
    if (phone.length === 10 && digits(m.phone).slice(-10) === phone) reasons.push("phone");
    if (domain && (domainOf(m.website) === domain || domainOf(m.email) === domain)) reasons.push("domain");
    if (m.sim > 0.35) reasons.push(m.sim > 0.75 ? "name" : "similar name");
    if (!reasons.length) continue;
    const strong = reasons.filter((r) => ["MID", "EIN last 4", "phone", "domain"].includes(r)).length;
    const confidence = reasons.includes("MID") || strong >= 2 ? "high" : strong === 1 || m.sim > 0.75 ? "medium" : "low";
    out.set(`m${m.id}`, {
      kind: "merchant", id: m.id, name: m.name, confidence, reasons,
      fields: [
        { label: "Business name", value: m.name }, { label: "Phone", value: m.phone }, { label: "Website domain", value: domainOf(m.website) },
        { label: "EIN", value: m.ein4 ? `••-•••${m.ein4}` : null }, { label: "MID", value: m.mid }, { label: "Address", value: [m.street, m.city].filter(Boolean).join(", ") || null },
      ],
    });
  }

  // Open leads
  const leads = await db.select({
    id: schema.leads.id, name: schema.leads.businessName, phone: schema.leads.phone, website: schema.leads.website, email: schema.leads.email, ein4: schema.leads.einLast4,
    sim: dsql<number>`similarity(${schema.leads.businessName}, ${name})`,
  }).from(schema.leads).where(and(inArray(schema.leads.status, ["open"]), opts.excludeLeadId ? dsql`${schema.leads.id} <> ${opts.excludeLeadId}` : undefined, or(
    name.length >= 3 ? gt(dsql`similarity(${schema.leads.businessName}, ${name})`, 0.35) : undefined,
    phone.length === 10 ? dsql`right(regexp_replace(coalesce(${schema.leads.phone},''), '\\D', '', 'g'), 10) = ${phone}` : undefined,
    domain ? or(ilike(schema.leads.website, `%${domain}%`), ilike(schema.leads.email, `%@${domain}`)) : undefined,
    input.einLast4 ? eq(schema.leads.einLast4, input.einLast4) : undefined,
  ))).limit(10);
  for (const l of leads) {
    const reasons: string[] = [];
    if (phone.length === 10 && digits(l.phone).slice(-10) === phone) reasons.push("phone");
    if (domain && (domainOf(l.website) === domain || domainOf(l.email) === domain)) reasons.push("domain");
    if (input.einLast4 && l.ein4 === input.einLast4) reasons.push("EIN last 4");
    if (l.sim > 0.35) reasons.push(l.sim > 0.75 ? "name" : "similar name");
    if (!reasons.length) continue;
    const strong = reasons.filter((r) => ["phone", "domain", "EIN last 4"].includes(r)).length;
    out.set(`l${l.id}`, {
      kind: "lead", id: l.id, name: l.name, confidence: strong >= 2 ? "high" : strong === 1 || l.sim > 0.75 ? "medium" : "low", reasons,
      fields: [{ label: "Business name", value: l.name }, { label: "Phone", value: l.phone }, { label: "Website domain", value: domainOf(l.website ?? l.email) }, { label: "EIN", value: l.ein4 ? `••-•••${l.ein4}` : null }, { label: "MID", value: null }, { label: "Address", value: null }],
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return [...out.values()].sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 5);
}
