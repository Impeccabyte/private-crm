"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { replyToRequest, type RequestState } from "./actions";

/**
 * "Reply" on a pinned Needs-you item opens the reply right there. Once sent, the page refreshes and the item
 * leaves the pinned group and settles into Today as "You replied".
 */
export function InlineReply({ ticketId, label }: { ticketId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [st, action, pending] = useActionState<RequestState, FormData>(replyToRequest, {});
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) box.current?.focus(); }, [open]);

  if (!open) {
    return (
      <button type="button" className="mp-btn" onClick={() => setOpen(true)} aria-expanded={false}>
        {label}<ArrowRight aria-hidden="true" />
      </button>
    );
  }
  return (
    <form action={action} className="mp-inline-reply" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      {/* Sent from home: the server redirects to /portal?settled=<id> so the reply settles into Today exactly once. */}
      <input type="hidden" name="from" value="home" />
      <label className="sr" htmlFor={`reply-${ticketId}`}>Your reply</label>
      <textarea ref={box} id={`reply-${ticketId}`} name="body" className="mp-textarea" rows={3}
        aria-invalid={st.fieldErrors?.body ? true : undefined} aria-describedby={st.fieldErrors?.body || st.error ? `reply-${ticketId}-err` : undefined} />
      {(st.fieldErrors?.body || st.error) && <span className="err" id={`reply-${ticketId}-err`} role="alert">{st.fieldErrors?.body ?? st.error}</span>}
      <div className="acts">
        <button className="mp-btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reply"}</button>
        <button className="mp-btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
