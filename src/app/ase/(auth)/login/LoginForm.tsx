"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";
import { loginAction, type FormState } from "../actions";

export function LoginForm({ next, notice, ssoLabel }: { next: string; notice?: string | null; ssoLabel?: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const fe = state.fieldErrors ?? {};
  const locked = state.error?.startsWith("locked:") ? state.error.slice(7) : null;

  return (
    <>
      <div>
        <h1>Sign in</h1>
        <p className="lede">For Impeccabyte staff and agents. Use your work email.</p>
      </div>
      {notice && <div className="banner blue" role="status"><div className="bt sm">{notice}</div></div>}
      {state.error === "mismatch" && (
        <div className="banner red" role="alert">
          <AlertTriangle size={16} aria-hidden="true" style={{ marginTop: 2 }} />
          <div><div className="bt">That email and password don’t match</div><div className="bd sm">Check both and try again. Repeated failures pause sign-in for a few minutes.</div></div>
        </div>
      )}
      {locked && (
        <div className="banner amber" role="alert">
          <Lock size={16} aria-hidden="true" style={{ marginTop: 2 }} />
          <div><div className="bt">Sign-in paused</div><div className="bd sm">Too many attempts. Try again after {locked}, or <Link href="/ase/forgot-password">reset your password</Link>.</div></div>
        </div>
      )}
      {state.error && state.error !== "mismatch" && !locked && <div className="banner red" role="alert"><div className="bt sm">{state.error}</div></div>}

      <form className="lg-fields" action={action} noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email ?? ""}
            className={`inp ${fe.email ? "err" : ""}`} placeholder="name@impeccabyte.com" aria-invalid={!!fe.email} aria-describedby={fe.email ? "email-err" : undefined} autoFocus />
          {fe.email && <span className="errt" id="email-err"><AlertTriangle size={12} aria-hidden="true" />{fe.email}</span>}
        </div>
        <div className="field">
          <div className="lg-row"><label htmlFor="password">Password</label><Link className="lnk" href="/ase/forgot-password">Forgot password?</Link></div>
          <div className={`inpw ${fe.password ? "err" : ""}`}>
            <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required
              onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} aria-invalid={!!fe.password} aria-describedby={fe.password ? "pw-err" : undefined} />
            <button type="button" className="pw-btn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          {fe.password && <span className="errt" id="pw-err"><AlertTriangle size={12} aria-hidden="true" />{fe.password}</span>}
          {caps && <span className="hint" style={{ color: "var(--a-ink)" }}>Caps Lock is on</span>}
        </div>
        <label className="row" style={{ gap: 8, cursor: "pointer", minHeight: 24 }}><input type="checkbox" name="remember" defaultChecked />Keep me signed in</label>
        <button type="submit" className="btn pri block" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      {ssoLabel && (
        <a className="btn block" href={`/auth/sso/start?next=${encodeURIComponent(next)}`}>Sign in with {ssoLabel}</a>
      )}
      <div className="hint">Access is role-based and sign-ins are logged. Don’t have an account? Ask your manager to invite you.</div>
    </>
  );
}
