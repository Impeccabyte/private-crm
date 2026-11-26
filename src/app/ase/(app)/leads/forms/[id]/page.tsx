import { notFound } from "next/navigation";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { appUrl, typed } from "@/lib/lead-forms/server";
import { Builder } from "./Builder";

export const metadata = { title: "Edit lead form" };

export default async function LeadFormEditor({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("leadforms.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await db.query.leadForms.findFirst({ where: eq(schema.leadForms.id, id) });
  if (!row) notFound();
  const form = typed(row);
  const [g, owners, subs] = await Promise.all([
    getSetting("general"),
    db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(ne(schema.users.status, "disabled")).orderBy(asc(schema.users.name)),
    db.select({ s: schema.leadFormSubmissions, lead: schema.leads.businessName }).from(schema.leadFormSubmissions)
      .leftJoin(schema.leads, eq(schema.leadFormSubmissions.leadId, schema.leads.id))
      .where(eq(schema.leadFormSubmissions.formId, id)).orderBy(desc(schema.leadFormSubmissions.createdAt)).limit(50),
  ]);
  return (
    <Builder
      form={{ id: form.id, publicId: form.publicId, name: form.name, status: form.status as "draft" | "published", archived: !!form.archivedAt, fields: form.fields, settings: form.settings }}
      owners={owners.map((o) => ({ id: o.id, name: o.name }))}
      defaultAccent={g.accentColor}
      baseUrl={appUrl()}
      submissions={subs.map(({ s, lead }) => ({ id: s.id, at: s.createdAt.toISOString(), outcome: s.outcome, leadId: s.leadId, lead, pageUrl: s.pageUrl, data: s.data as Record<string, string> }))}
    />
  );
}
