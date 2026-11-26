import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, assertMerchantInScope, scopeOwnerIds } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Banner, PageHeader } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { createApplication } from "../actions";

export const metadata = { title: "New boarding application" };

export default async function NewApplication({ searchParams }: { searchParams: Promise<{ deal?: string; merchant?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "deals.edit") && !can(user.role, "applications.edit")) redirect("/ase/applications");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const deal = sp.deal && /^[0-9a-f-]{36}$/.test(sp.deal) ? await db.query.deals.findFirst({ where: eq(schema.deals.id, sp.deal) }) : null;
  if (deal && owners && (!deal.ownerId || !owners.includes(deal.ownerId))) redirect("/ase/deals");
  const lead = deal?.leadId ? await db.query.leads.findFirst({ where: eq(schema.leads.id, deal.leadId) }) : null;
  const merchantId = sp.merchant ?? deal?.merchantId ?? lead?.merchantId ?? null;
  if (merchantId) await assertMerchantInScope(user, merchantId);
  const merchant = merchantId ? await db.query.merchants.findFirst({ where: eq(schema.merchants.id, merchantId) }) : null;
  const le = merchant?.legalEntityId ? await db.query.legalEntities.findFirst({ where: eq(schema.legalEntities.id, merchant.legalEntityId) }) : null;
  const conns = await db.select().from(schema.processorConnections).where(eq(schema.processorConnections.enabled, true)).orderBy(asc(schema.processorConnections.createdAt));
  const prefilled = [merchant || deal, le || lead, deal?.amount || lead?.estMonthlyVolume, lead?.mcc || merchant?.mcc].filter(Boolean).length;

  return (
    <div className="content" style={{ maxWidth: 820 }}>
      <PageHeader title="Create boarding application" crumbs={[{ href: "/ase/applications", label: "Applications" }, { label: "New" }]}
        sub={deal ? `From won deal · ${deal.name}` : merchant ? `For ${merchant.dbaName}` : "Starts in New. Work through the checklist, collect signatures, then submit to underwriting."} />
      {(deal || merchant) && <Banner tone="blue" title={`${prefilled} of 4 key fields pre-filled`}>Taken from the deal, lead and merchant record. Everything else is collected in the checklist.</Banner>}
      <section className="card">
        <div className="card-b">
          <ActionForm action={createApplication} submitLabel="Create application" className="stack" footer={<Link className="btn" href={deal ? "/ase/deals" : "/ase/applications"}>Not now</Link>}>
            {merchant && <input type="hidden" name="merchantId" value={merchant.id} />}
            {deal && <input type="hidden" name="dealId" value={deal.id} />}
            <div className="form-grid">
              <Field label="DBA name" name="dbaName"><input id="dbaName" name="dbaName" className="inp" defaultValue={merchant?.dbaName ?? deal?.name ?? ""} disabled={!!merchant} /></Field>
              <Field label="Legal name" name="legalName"><input id="legalName" name="legalName" className="inp" defaultValue={le?.legalName ?? ""} disabled={!!merchant} /></Field>
              <Field label="MCC" name="mcc"><input id="mcc" name="mcc" className="inp" defaultValue={merchant?.mcc ?? lead?.mcc ?? ""} disabled={!!merchant} /></Field>
              <Field label="Application for" name="forLabel"><input id="forLabel" name="forLabel" className="inp" defaultValue={merchant ? "Additional location or MID" : "New merchant"} /></Field>
              <Field label="Est. monthly volume ($)" name="volume"><input id="volume" name="volume" className="inp" defaultValue={deal?.amount || lead?.estMonthlyVolume || ""} inputMode="decimal" /></Field>
              <Field label="Average ticket ($)" name="avgTicket"><input id="avgTicket" name="avgTicket" className="inp" inputMode="decimal" /></Field>
              <Field label="Pricing campaign" name="campaign" hint="Campaigns control pricing, fees and processing type at Maverick.">
                <select id="campaign" name="campaign" className="inp" defaultValue="Standard IC+"><option>Standard IC+</option><option>Q4 2026 · Healthcare IC+</option><option>Restaurant flat rate</option><option>Tiered</option></select>
              </Field>
              <Field label="Processor connection" name="connectionId" hint="Where the account will be boarded.">
                <select id="connectionId" name="connectionId" className="inp" defaultValue={conns[0]?.id ?? ""}>
                  {conns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.mode})</option>)}<option value="">None yet</option>
                </select>
              </Field>
            </div>
            <div className="hint">The application is created in the CRM. Pushing a new application to Maverick’s boarding API needs your campaign IDs and field mapping confirmed. Until then, create it in the Maverick Dashboard and it links on the next sync.</div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
