import { and, desc, eq, ilike, inArray, or, sql as dsql, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser, scopeOwnerIds } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { maskEin } from "@/lib/crypto";
import { MERCHANT_STATUS_LABEL } from "@/lib/format";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const owners = await scopeOwnerIds(user);
  // Hidden (inactive boarding) merchants stay out of search.
  const scope = and(owners ? inArray(schema.merchants.ownerId, owners) : undefined, isNull(schema.merchants.hiddenAt));
  const digits = q.replace(/\D/g, "");
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const base = db
    .selectDistinctOn([schema.merchants.id], {
      id: schema.merchants.id, dba: schema.merchants.dbaName, status: schema.merchants.status, ein4: schema.legalEntities.einLast4,
      mid: schema.merchantAccounts.mid, phone: schema.merchants.csPhone, email: schema.merchants.csEmail,
      cFirst: schema.contacts.firstName, cLast: schema.contacts.lastName, cEmail: schema.contacts.email, cPhone: schema.contacts.phone,
      updatedAt: schema.merchants.updatedAt,
    })
    .from(schema.merchants)
    .leftJoin(schema.legalEntities, eq(schema.merchants.legalEntityId, schema.legalEntities.id))
    .leftJoin(schema.merchantAccounts, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
    .leftJoin(schema.contacts, eq(schema.contacts.merchantId, schema.merchants.id));

  const rows = q
    ? await base.where(and(scope, or(
        ilike(schema.merchants.dbaName, like),
        ilike(schema.legalEntities.legalName, like),
        digits.length >= 4 ? ilike(schema.merchantAccounts.mid, `%${digits}%`) : undefined,
        digits.length === 4 ? eq(schema.legalEntities.einLast4, digits) : undefined,
        digits.length >= 4 ? dsql`regexp_replace(coalesce(${schema.merchants.csPhone},'') || ' ' || coalesce(${schema.contacts.phone},''), '\\D', '', 'g') like ${`%${digits}%`}` : undefined,
        ilike(dsql`coalesce(${schema.contacts.firstName},'') || ' ' || coalesce(${schema.contacts.lastName},'')`, like),
        ilike(schema.merchants.csEmail, like),
        ilike(schema.contacts.email, like),
      ))).orderBy(schema.merchants.id).limit(40)
    : await base.where(scope).orderBy(schema.merchants.id).limit(40);

  const lower = q.toLowerCase();
  const why = (r: (typeof rows)[number]) => {
    if (!q) return "Merchant";
    if (r.dba.toLowerCase().includes(lower)) return "DBA name";
    if (digits.length === 4 && r.ein4 === digits) return "EIN last 4";
    if (digits.length >= 4 && r.mid?.includes(digits)) return "MID";
    if (digits.length >= 4 && ((r.phone ?? "") + (r.cPhone ?? "")).replace(/\D/g, "").includes(digits)) return "Phone";
    if (`${r.cFirst} ${r.cLast}`.toLowerCase().includes(lower)) return "Contact";
    if ((r.email ?? "").toLowerCase().includes(lower) || (r.cEmail ?? "").toLowerCase().includes(lower)) return "Email";
    return "Legal name";
  };

  const results = rows.slice(0, 8).map((r) => ({
    id: r.id, kind: "merchant" as const, title: r.dba,
    sub: [r.mid ? `MID ${r.mid}` : null, r.ein4 ? `EIN ${maskEin(r.ein4)}` : null, r.cFirst ? `${r.cFirst} ${r.cLast}` : null, r.phone].filter(Boolean).join(" · "),
    why: why(r), status: MERCHANT_STATUS_LABEL[r.status] ?? r.status, href: `/ase/merchants/${r.id}`,
  }));

  if (q && can(user.role, "leads.view")) {
    const leads = await db.select().from(schema.leads)
      .where(and(owners ? inArray(schema.leads.ownerId, owners) : undefined, or(ilike(schema.leads.businessName, like), ilike(schema.leads.contactName, like), ilike(schema.leads.email, like))))
      .orderBy(desc(schema.leads.updatedAt)).limit(4);
    results.push(...leads.map((l) => ({ id: l.id, kind: "lead" as const, title: l.businessName, sub: [l.contactName, l.phone].filter(Boolean).join(" · "), why: "Lead", status: l.status === "open" ? "Open" : l.status, href: `/ase/leads?lead=${l.id}` })) as never[]);
  }
  return Response.json({ results });
}
