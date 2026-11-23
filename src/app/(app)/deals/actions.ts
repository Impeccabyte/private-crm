"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, requirePermission, scopeOwnerIds } from "@/lib/dal";
import { audit } from "@/lib/audit";

const STAGES = ["new_lead", "contacted", "qualified", "proposal", "application_sent", "won", "lost"] as const;

export async function moveDeal(dealId: string, stage: (typeof STAGES)[number], lostReason?: string): Promise<{ ok?: boolean; error?: string; next?: string }> {
  try {
    const user = await requirePermission("deals.edit");
    z.enum(STAGES).parse(stage);
    const deal = await db.query.deals.findFirst({ where: eq(schema.deals.id, dealId) });
    const owners = await scopeOwnerIds(user);
    if (!deal || (owners && (!deal.ownerId || !owners.includes(deal.ownerId)))) return { error: "Deal not found." };
    if (stage === "lost" && !lostReason?.trim()) return { error: "Give a reason for losing the deal." };
    if (deal.stage === stage) return { ok: true };
    await db.update(schema.deals).set({
      stage, stageChangedAt: new Date(), lostReason: stage === "lost" ? lostReason!.trim().slice(0, 300) : null,
      closedAt: stage === "won" || stage === "lost" ? new Date() : null,
    }).where(eq(schema.deals.id, dealId));
    await db.insert(schema.dealStageHistory).values({ dealId, stage });
    if (deal.leadId && stage === "won") await db.update(schema.leads).set({ status: "converted" }).where(eq(schema.leads.id, deal.leadId));
    await audit(await actorFor(user), "deal.move", "deal", dealId, { from: deal.stage, to: stage });
    revalidatePath("/deals");
    const hasApp = await db.query.applications.findFirst({ where: eq(schema.applications.dealId, dealId), columns: { id: true } });
    return { ok: true, next: stage === "won" && !hasApp ? `/applications/new?deal=${dealId}` : undefined };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function createDeal(f: FormData) {
  const user = await requirePermission("deals.edit");
  const name = String(f.get("name") ?? "").trim();
  const amount = Number(String(f.get("amount") ?? "0").replace(/[$,]/g, "")) || 0;
  if (!name) return;
  const [d] = await db.insert(schema.deals).values({ name, amount, stage: "new_lead", ownerId: user.id }).returning();
  await db.insert(schema.dealStageHistory).values({ dealId: d!.id, stage: "new_lead" });
  await audit(await actorFor(user), "deal.create", "deal", d!.id);
  revalidatePath("/deals");
}
