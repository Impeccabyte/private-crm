"use client";

import { useActionState, useEffect, useRef } from "react";
import { replyToRequest, type RequestState } from "../../actions";

export function ReplyForm({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const [st, action, pending] = useActionState<RequestState, FormData>(replyToRequest, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (st.ok) ref.current?.reset(); }, [st]);
  return (
    <form ref={ref} action={action} className="mp-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="mp-field">
        <label htmlFor="body">{closed ? "Need to pick this back up? Reply and we'll reopen it." : "Reply"}</label>
        <textarea className="mp-textarea" id="body" name="body" aria-invalid={st.fieldErrors?.body ? true : undefined} aria-describedby={st.fieldErrors?.body ? "body-err" : undefined} style={{ minHeight: 100 }} />
        {st.fieldErrors?.body && <span className="err" id="body-err">{st.fieldErrors.body}</span>}
      </div>
      {st.error && <p className="mp-callout bad" role="alert">{st.error}</p>}
      {st.ok && <p className="mp-callout ok" role="status">{st.ok}</p>}
      <div><button className="mp-btn" type="submit" disabled={pending}>{pending ? "Sending…" : closed ? "Reply and reopen" : "Send reply"}</button></div>
    </form>
  );
}
