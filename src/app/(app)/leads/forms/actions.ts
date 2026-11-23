"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { DEFAULT_SETTINGS, fieldsSchema, publishProblems, settingsSchema, starterFields, type FormField, type FormSettings } from "@/lib/lead-forms/types";
import { newPublicId, typed } from "@/lib/lead-forms/server";

export type SaveResult = { ok?: string; error?: string; problems?: string[] };

const zodMsg = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form settings.";

async function load(id: string) {
  const f = await db.query.leadForms.findFirst({ where: eq(schema.leadForms.id, id) });
  if (!f) throw new Error("Form not found.");
  return typed(f);
}

export async function createForm() {
  const user = await requirePermission("leadforms.manage");
  const [f] = await db.insert(schema.leadForms).values({
    name: "Untitled form", publicId: newPublicId(), fields: starterFields(), settings: DEFAULT_SETTINGS, createdById: user.id,
  }).returning({ id: schema.leadForms.id });
  await audit(await actorFor(user), "leadform.create", "lead_form", f!.id);
  redirect(`/leads/forms/${f!.id}`);
}

export async function saveForm(id: string, input: { name: string; fields: FormField[]; settings: FormSettings }): Promise<SaveResult> {
  try {
    const user = await requirePermission("leadforms.manage");
    const form = await load(id);
    const name = z.string().trim().min(1, "Give the form a name").max(120).parse(input.name);
    const fields = fieldsSchema.parse(input.fields);
    const settings = settingsSchema.parse({ ...DEFAULT_SETTINGS, ...input.settings });
    if (settings.ownerId && !(await db.query.users.findFirst({ where: eq(schema.users.id, settings.ownerId), columns: { id: true } }))) return { error: "That lead owner no longer exists." };
    const problems = publishProblems(fields as FormField[]);
    if (form.status === "published" && problems.length) return { error: "This form is live, so these need fixing before you save:", problems };
    await db.update(schema.leadForms).set({ name, fields, settings, updatedAt: new Date() }).where(eq(schema.leadForms.id, id));
    await audit(await actorFor(user), "leadform.update", "lead_form", id, { name, fields: fields.length, live: form.status === "published" });
    revalidatePath(`/leads/forms/${id}`);
    revalidatePath("/leads/forms");
    return { ok: form.status === "published" ? "Saved. The live form is updated." : "Saved.", problems };
  } catch (e) {
    return { error: e instanceof z.ZodError ? zodMsg(e) : (e as Error).message };
  }
}

export async function setPublished(id: string, publish: boolean): Promise<SaveResult> {
  try {
    const user = await requirePermission("leadforms.manage");
    const form = await load(id);
    if (publish) {
      const problems = publishProblems(form.fields);
      if (problems.length) return { error: "Fix these before publishing:", problems };
      if (form.archivedAt) return { error: "Restore the form before publishing it." };
    }
    await db.update(schema.leadForms).set({ status: publish ? "published" : "draft", publishedAt: publish ? (form.publishedAt ?? new Date()) : form.publishedAt, updatedAt: new Date() }).where(eq(schema.leadForms.id, id));
    await audit(await actorFor(user), publish ? "leadform.publish" : "leadform.unpublish", "lead_form", id, { name: form.name });
    revalidatePath(`/leads/forms/${id}`);
    revalidatePath("/leads/forms");
    return { ok: publish ? "Published. The embed snippet is ready." : "Unpublished. Embedded copies now show “This form isn’t available.”" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setArchived(id: string, archived: boolean): Promise<SaveResult> {
  try {
    const user = await requirePermission("leadforms.manage");
    const form = await load(id);
    await db.update(schema.leadForms).set({ archivedAt: archived ? new Date() : null, status: archived ? "draft" : form.status, updatedAt: new Date() }).where(eq(schema.leadForms.id, id));
    await audit(await actorFor(user), archived ? "leadform.archive" : "leadform.restore", "lead_form", id, { name: form.name });
    revalidatePath(`/leads/forms/${id}`);
    revalidatePath("/leads/forms");
    return { ok: archived ? "Archived. It’s unpublished and its leads are kept." : "Restored as a draft." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function duplicateForm(id: string) {
  const user = await requirePermission("leadforms.manage");
  const form = await load(id);
  const [f] = await db.insert(schema.leadForms).values({
    name: `${form.name} (copy)`.slice(0, 120), publicId: newPublicId(), fields: form.fields, settings: form.settings, createdById: user.id,
  }).returning({ id: schema.leadForms.id });
  await audit(await actorFor(user), "leadform.create", "lead_form", f!.id, { duplicatedFrom: id });
  redirect(`/leads/forms/${f!.id}`);
}
