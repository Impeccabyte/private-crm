"use client";

import { useActionState } from "react";
import { changePortalPassword, type RequestState } from "../actions";

export function PasswordForm() {
  const [st, action, pending] = useActionState<RequestState, FormData>(changePortalPassword, {});
  const e = st.fieldErrors ?? {};
  const field = (id: string, label: string, auto: string) => (
    <div className="mp-field">
      <label htmlFor={id}>{label}</label>
      <input className="mp-input" type="password" id={id} name={id} autoComplete={auto} aria-invalid={e[id] ? true : undefined} aria-describedby={e[id] ? `${id}-err` : undefined} />
      {e[id] && <span className="err" id={`${id}-err`}>{e[id]}</span>}
    </div>
  );
  return (
    <form action={action} className="mp-form" style={{ gap: 14 }} noValidate>
      {st.error && <p className="mp-callout bad" role="alert">{st.error}</p>}
      {field("current", "Current password", "current-password")}
      {field("next", "New password", "new-password")}
      {field("confirm", "Type the new one again", "new-password")}
      <p className="sm muted">Changing it signs you out everywhere, so sign back in with the new one.</p>
      <div><button className="mp-btn sec" type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</button></div>
    </form>
  );
}
