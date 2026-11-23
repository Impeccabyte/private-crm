"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorFor, assertMerchantInScope, requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { adapterFor, configOf, getConnection } from "@/lib/integrations";
import type { ActionState } from "@/components/forms";

async function load(id: string) {
  const user = await requirePermission("chargebacks.edit");
  const cb = await db.query.chargebacks.findFirst({ where: eq(schema.chargebacks.id, id) });
  if (!cb) throw new Error("Chargeback not found.");
  if (cb.merchantId) await assertMerchantInScope(user, cb.merchantId);
  return { user, cb };
}

export async function acceptChargeback(id: string, confirmed = false): Promise<ActionState> {
  try {
    const { user, cb } = await load(id);
    if (cb.status !== "Processed") return { error: `This chargeback is already ${cb.status.toLowerCase()}.` };
    let note = "Recorded in the CRM.";
    if (cb.connectionId && cb.externalId) {
      const conn = await getConnection(cb.connectionId);
      if (conn?.enabled) {
        if (configOf(conn).confirmWrites && !confirmed) return { error: "CONFIRM" };
        await adapterFor(conn).acceptChargeback(cb.externalId, cb.caseId);
        note = "Accepted in Maverick.";
      }
    }
    await db.update(schema.chargebacks).set({ disputeStatus: "accepted", status: "Lost" }).where(eq(schema.chargebacks.id, id));
    if (cb.merchantId) await db.insert(schema.activities).values({ type: "system", title: `Chargeback ${cb.caseId} accepted`, merchantId: cb.merchantId, actorUserId: user.id, tag: cb.caseId });
    await audit(await actorFor(user), "chargeback.accept", "chargeback", id);
    revalidatePath("/chargebacks");
    return { ok: `Accepted. ${note}` };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveDispute(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const { user, cb } = await load(String(f.get("id")));
    const notes = String(f.get("notes") ?? "").trim();
    if (notes.length < 20) return { error: "Write the rebuttal (at least a couple of sentences)." };
    await db.update(schema.chargebacks).set({ disputeNotes: notes, disputeStatus: "draft" }).where(eq(schema.chargebacks.id, cb.id));
    await audit(await actorFor(user), "chargeback.dispute_draft", "chargeback", cb.id);
    revalidatePath("/chargebacks");
    return { ok: "Dispute response saved as a draft." };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function submitDispute(id: string): Promise<ActionState> {
  try {
    const { user, cb } = await load(id);
    if (cb.disputeStatus !== "draft" || !cb.disputeNotes) return { error: "Build the dispute response first." };
    await db.update(schema.chargebacks).set({ disputeStatus: "submitted" }).where(eq(schema.chargebacks.id, id));
    if (cb.merchantId) await db.insert(schema.activities).values({ type: "system", title: `Dispute submitted for ${cb.caseId}`, body: cb.disputeNotes, merchantId: cb.merchantId, actorUserId: user.id, tag: cb.caseId });
    await audit(await actorFor(user), "chargeback.dispute_submit", "chargeback", id);
    revalidatePath("/chargebacks");
    return { ok: "Marked as submitted. Upload the evidence in the Maverick Dashboard: dispute file upload isn’t connected in this build." };
  } catch (e) { return { error: (e as Error).message }; }
}
