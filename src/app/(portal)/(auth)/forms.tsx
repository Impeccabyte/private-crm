"use client";

import { useActionState } from "react";
import { portalForgot, portalLogin, portalSetPassword, type AuthState } from "./actions";

function Field({ id, label, type = "text", autoComplete, defaultValue, error, hint }: { id: string; label: string; type?: string; autoComplete?: string; defaultValue?: string; error?: string; hint?: string }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mp-field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      <input className="mp-input" id={id} name={id} type={type} autoComplete={autoComplete} defaultValue={defaultValue} aria-invalid={error ? true : undefined} aria-describedby={describedBy} required />
      {error && <span className="err" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

function Problem({ text }: { text?: string }) {
  return text ? <p className="mp-callout bad" role="alert">{text}</p> : null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(portalLogin, {});
  return (
    <form action={action} noValidate>
      <Problem text={state.error} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <label className="mp-check"><input type="checkbox" name="remember" /> Keep me signed in on this device</label>
      <button className="mp-btn" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(portalForgot, {});
  if (state.ok) {
    return (
      <p className="mp-callout ok" role="status">
        If {state.email} has an Impeccabyte account, a link to choose a new password is on its way. Check your inbox and spam folder.
      </p>
    );
  }
  return (
    <form action={action} noValidate>
      <Field id="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <button className="mp-btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a link"}</button>
    </form>
  );
}

export function SetPasswordForm({ token, min }: { token: string; min: number }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(portalSetPassword, {});
  return (
    <form action={action} noValidate>
      <Problem text={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" type="password" autoComplete="new-password" hint={`At least ${min} characters. A short sentence works well.`} error={state.fieldErrors?.password} />
      <Field id="confirm" label="Type it again" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <button className="mp-btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
