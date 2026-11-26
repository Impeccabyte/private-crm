"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, Mail } from "lucide-react";
import { forgotPasswordAction, type FormState } from "../actions";

export function ForgotForm({ minutes }: { minutes: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  if (state.ok) {
    return (
      <>
        <span className="lg-ok t-green"><Mail size={22} aria-hidden="true" /></span>
        <div role="status">
          <h1>Check your email</h1>
          <p className="lede">If an account exists for <b style={{ color: "var(--ink)" }}>{state.email}</b>, we’ve sent a link to reset your password. It expires in {minutes} minutes.</p>
        </div>
        <Link className="btn" href="/ase/login" style={{ alignSelf: "flex-start" }}>Back to sign in</Link>
        <div className="hint">Nothing after a few minutes? Check spam, or ask an admin to send a new link.</div>
      </>
    );
  }
  const err = state.fieldErrors?.email;
  return (
    <>
      <Link className="lnk" href="/ase/login" style={{ alignSelf: "flex-start" }}><ChevronLeft size={12} aria-hidden="true" />Back to sign in</Link>
      <div>
        <h1>Reset your password</h1>
        <p className="lede">Enter your work email and we’ll send a link to choose a new password.</p>
      </div>
      <form className="lg-fields" action={action} noValidate>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" className={`inp ${err ? "err" : ""}`} defaultValue={state.email ?? ""}
            placeholder="name@impeccabyte.com" aria-invalid={!!err} aria-describedby={err ? "email-err" : undefined} autoFocus />
          {err && <span className="errt" id="email-err"><AlertTriangle size={12} aria-hidden="true" />{err}</span>}
        </div>
        <button type="submit" className="btn pri block" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      </form>
    </>
  );
}
