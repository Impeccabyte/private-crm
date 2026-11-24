"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { confirmDialog, notify } from "@/components/confirm";
import { createCampaign, deleteTemplate } from "./actions";

export function TemplateRow({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn sm" type="button" disabled={pending} onClick={() => start(async () => { await createCampaign(id); })}>Use template</button>
      <button className="btn ghost sm icon danger" type="button" disabled={pending} aria-label={`Delete template ${name}`} onClick={async () => {
        if (!(await confirmDialog(`Newsletters already made from “${name}” aren’t affected.`, { title: "Delete this template?", confirmLabel: "Delete template", danger: true }))) return;
        start(async () => { const r = await deleteTemplate(id); notify(r.ok ?? r.error ?? "", { error: !!r.error }); router.refresh(); });
      }}><Trash2 size={14} aria-hidden="true" /></button>
    </span>
  );
}
