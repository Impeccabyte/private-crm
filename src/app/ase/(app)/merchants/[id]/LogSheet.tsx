"use client";

import Link from "next/link";
import { Sheet } from "@/components/list";
import { ActionForm } from "@/components/forms";
import { createTask, logActivity } from "../../actions";

const META: Record<string, { title: string; placeholder: string }> = {
  call: { title: "Log a call", placeholder: "Who you spoke with, outcome, next step…" },
  email: { title: "Log an email", placeholder: "Paste or summarize the email…" },
  note: { title: "Add an internal note", placeholder: "Internal only. Use @Name to mention a teammate." },
  meeting: { title: "Log a meeting", placeholder: "Attendees, notes, follow-ups…" },
};

export function LogSheet({ merchantId, kind, closeHref }: { merchantId: string; kind: string; closeHref: string }) {
  if (kind === "task") {
    return (
      <Sheet title="New task" sub="Assigned to you" closeHref={closeHref} width={440}>
        <ActionForm action={createTask} submitLabel="Add task" className="stack" footer={<Link className="btn" href={closeHref} scroll={false}>Close</Link>}>
          <input type="hidden" name="merchantId" value={merchantId} />
          <div className="field"><label htmlFor="t-title">Task</label><input id="t-title" name="title" className="inp" autoFocus /></div>
          <div className="field"><label htmlFor="t-due">Due</label><input id="t-due" name="due" type="date" className="inp" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
        </ActionForm>
      </Sheet>
    );
  }
  const meta = META[kind] ?? META.note!;
  return (
    <Sheet title={meta.title} sub="Saved to the merchant’s activity timeline" closeHref={closeHref} width={480}>
      <ActionForm action={logActivity} submitLabel="Save" className="stack" footer={<Link className="btn" href={closeHref} scroll={false}>Close</Link>}>
        <input type="hidden" name="merchantId" value={merchantId} />
        <input type="hidden" name="type" value={META[kind] ? kind : "note"} />
        {kind !== "note" && <div className="field"><label htmlFor="a-title">Summary</label><input id="a-title" name="title" className="inp" placeholder={kind === "call" ? "Outbound call · 10 min · Reached" : "Subject"} /></div>}
        <div className="field"><label htmlFor="a-body">{kind === "note" ? "Note" : "Details"}</label><textarea id="a-body" name="body" className="inp" rows={6} placeholder={meta.placeholder} autoFocus /></div>
      </ActionForm>
    </Sheet>
  );
}
