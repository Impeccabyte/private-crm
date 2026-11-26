"use client";

import { confirmDialog } from "@/components/confirm";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Mail, StickyNote, Send, LayoutTemplate, Paperclip } from "lucide-react";
import { escalateToMaverick, postMessage } from "./actions";
import type { ActionState } from "@/components/forms";

export function Composer({ ticketId, to, maverick, templates }: { ticketId: string; to: string | null; maverick: boolean; templates: { id: string; name: string; body: string }[] }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [notify, setNotify] = useState(true);
  const [body, setBody] = useState("");
  const [tpl, setTpl] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (p, f) => {
    let r = await postMessage(p, f);
    if (r.error === "CONFIRM") {
      if (!(await confirmDialog("This reply will be posted to the ticket in Maverick’s help desk.", { title: "Post to Maverick?", confirmLabel: "Post reply" }))) return {};
      f.set("confirmed", "yes");
      r = await postMessage(p, f);
    }
    if (r.ok) setBody("");
    return r;
  }, {});
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setBody(""); }, [ticketId]);
  return (
    <form action={action} className={`composer ${mode === "note" ? "int" : ""}`}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="row" style={{ padding: "6px 8px 0", gap: 2 }}>
        <div className="seg" role="tablist" aria-label="Composer mode">
          <button type="button" className={mode === "reply" ? "on" : ""} role="tab" aria-selected={mode === "reply"} onClick={() => setMode("reply")}><Mail size={14} aria-hidden="true" />Reply</button>
          <button type="button" className={mode === "note" ? "on" : ""} role="tab" aria-selected={mode === "note"} onClick={() => setMode("note")}><StickyNote size={14} aria-hidden="true" />Internal note</button>
        </div>
        <span className="sp" />
        <span className="subtle sm">{mode === "note" ? "Only your team sees this" : maverick ? "Posts to the Maverick ticket" : `To: ${to ?? "no contact email on file"}`}</span>
      </div>
      <label className="sr" htmlFor={`comp-${ticketId}`}>{mode === "note" ? "Internal note" : "Reply"}</label>
      <textarea id={`comp-${ticketId}`} ref={ref} name="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={mode === "note" ? "Add an internal note… @mention a teammate" : "Write a reply… or pick a template"} />
      <div className="row" style={{ padding: "8px 10px", borderTop: "1px solid var(--line)", gap: 6 }}>
        <span className="rel">
          <button type="button" className="btn sm ghost" onClick={() => setTpl((t) => !t)} aria-expanded={tpl}><LayoutTemplate size={14} aria-hidden="true" />Templates</button>
          {tpl && (
            <span className="pop" role="menu" style={{ display: "block", width: 280, top: "auto", bottom: "calc(100% + 6px)", left: 0, right: "auto" }}>
              {templates.map((t) => <button type="button" key={t.id} className="mi" role="menuitem" onClick={() => { setBody(t.body); setTpl(false); ref.current?.focus(); }}>{t.name}</button>)}
            </span>
          )}
        </span>
        <button type="button" className="btn sm ghost icon" aria-label="Attach files (file storage isn’t connected in this build)" title="File storage isn’t connected in this build" disabled><Paperclip size={14} aria-hidden="true" /></button>
        <span className="sp" />
        {state.ok && <span className="sm tx-green" role="status">{state.ok}</span>}
        {state.error && <span className="sm tx-red" role="alert">{state.error}</span>}
        {mode === "reply" && !maverick && (
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className={`switch ${notify ? "on" : ""}`} role="switch" aria-checked={notify} aria-labelledby={`notify-${ticketId}`} onClick={() => setNotify((n) => !n)} />
            <span id={`notify-${ticketId}`} className="sm muted">Notify merchant</span>
            {notify && <input type="hidden" name="notify" value="on" />}
          </span>
        )}
        <button className="btn sm pri" type="submit" disabled={pending || !body.trim()}><Send size={14} aria-hidden="true" />{pending ? "Sending…" : mode === "note" ? "Add note" : notify || maverick ? "Send reply" : "Save reply (no email)"}</button>
      </div>
    </form>
  );
}

export function EscalateButton({ ticketId }: { ticketId: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState | null>(null);
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn sm" disabled={pending} onClick={async () => {
        if (!(await confirmDialog("A ticket is created in Maverick’s help desk for this merchant. Replies sync both ways.", { title: "Escalate to Maverick?", confirmLabel: "Escalate" }))) return;
        start(async () => {
          let r = await escalateToMaverick(ticketId, false);
          if (r.error === "CONFIRM") r = await escalateToMaverick(ticketId, true);
          setRes(r);
        });
      }}><span className="pm" aria-hidden="true">M</span>Escalate to Maverick</button>
      {res?.ok && <span className="sm tx-green">{res.ok}</span>}{res?.error && <span className="sm tx-red">{res.error}</span>}
    </span>
  );
}
