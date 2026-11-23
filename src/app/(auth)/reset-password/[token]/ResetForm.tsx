"use client";

import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { resetPasswordAction, type FormState } from "../../actions";

export function ResetForm({ token, email, invite, minLength }: { token: string; email: string; invite: boolean; minLength: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <>
      <div>
        <h1>{invite ? "Set your password" : "Choose a new password"}</h1>
        <p className="lede">For <b style={{ color: "var(--ink)" }}>{email}</b>. Use at least {minLength} characters with letters and numbers.</p>
      </div>
      {state.error && <div className="banner red" role="alert"><div className="bt sm">{state.error}</div></div>}
      <form className="lg-fields" action={action} noValidate>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" className={`inp ${fe.password ? "err" : ""}`} aria-invalid={!!fe.password} aria-describedby={fe.password ? "pw-err" : undefined} autoFocus />
          {fe.password && <span className="errt" id="pw-err"><AlertTriangle size={12} aria-hidden="true" />{fe.password}</span>}
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" className={`inp ${fe.confirm ? "err" : ""}`} aria-invalid={!!fe.confirm} aria-describedby={fe.confirm ? "cf-err" : undefined} />
          {fe.confirm && <span className="errt" id="cf-err"><AlertTriangle size={12} aria-hidden="true" />{fe.confirm}</span>}
        </div>
        <button type="submit" className="btn pri block" disabled={pending}>{pending ? "Saving…" : invite ? "Set password" : "Update password"}</button>
      </form>
    </>
  );
}
