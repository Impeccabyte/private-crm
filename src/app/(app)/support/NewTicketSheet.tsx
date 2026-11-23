import Link from "next/link";
import { asc, inArray, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, scopeOwnerIds } from "@/lib/dal";
import { Sheet } from "@/components/list";
import { ActionForm, Field } from "@/components/forms";
import { createTicket } from "./actions";

export async function NewTicketSheet({ closeHref, merchantId }: { closeHref: string; merchantId?: string }) {
  const user = await requireUser();
  const owners = await scopeOwnerIds(user);
  const merchants = await db.select({ id: schema.merchants.id, name: schema.merchants.dbaName }).from(schema.merchants)
    .where(and(owners ? inArray(schema.merchants.ownerId, owners) : undefined, isNull(schema.merchants.hiddenAt))).orderBy(asc(schema.merchants.dbaName));
  return (
    <Sheet title="New ticket" sub="Internal ticket · escalate to Maverick later if it’s a processor issue" closeHref={closeHref}>
      <ActionForm action={createTicket} submitLabel="Create ticket" className="stack" footer={<Link className="btn" href={closeHref}>Cancel</Link>}>
        <Field label="Merchant" name="merchantId">
          <select id="merchantId" name="merchantId" className="inp" defaultValue={merchantId ?? ""}><option value="">— None —</option>{merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </Field>
        <Field label="Subject" name="subject"><input id="subject" name="subject" className="inp" autoFocus /></Field>
        <div className="form-grid">
          <Field label="Category" name="category"><select id="category" name="category" className="inp"><option>Hardware</option><option>Funding</option><option>Chargebacks</option><option>Billing</option><option>Account change</option><option>Risk</option><option>Other</option></select></Field>
          <Field label="Priority" name="priority"><select id="priority" name="priority" className="inp" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field>
        </div>
        <Field label="Details" name="body"><textarea id="body" name="body" className="inp" rows={6} placeholder="What’s happening? Saved as the first internal note." /></Field>
      </ActionForm>
    </Sheet>
  );
}
