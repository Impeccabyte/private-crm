"use client";

import { confirmDialog } from "@/components/confirm";
import { useActionState, useState, useTransition, type ReactNode } from "react";

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; detail?: string; secret?: string };

/** A form bound to a server action, with inline success/error feedback and field-level errors. */
export function ActionForm({ action, children, submitLabel = "Save changes", className, footer, resetOnOk }: {
  action: (prev: ActionState, f: FormData) => Promise<ActionState>;
  children: ReactNode; submitLabel?: string; className?: string; footer?: ReactNode; resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className} noValidate key={resetOnOk && state.ok ? state.ok + Date.now() : undefined}>
      {children}
      {state.fieldErrors && (
        <ul className="notice flash-err" role="alert" style={{ margin: 0, paddingLeft: 28 }}>
          {Object.entries(state.fieldErrors).map(([k, v]) => <li key={k}><b>{labelFor(k)}:</b> {v}</li>)}
        </ul>
      )}
      {state.error && !state.fieldErrors && <div className="notice flash-err" role="alert">{state.error}</div>}
      {state.ok && <div className="notice flash-ok" role="status">{state.ok}</div>}
      <div className="row w" style={{ gap: 8 }}>
        <button className="btn pri" type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {footer}
      </div>
    </form>
  );
}

const labelFor = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** A button that runs a bound server action and shows the result next to it. */
export function ActionButton({ action, label, pendingLabel, className = "btn", confirm, showDetail }: {
  action: () => Promise<ActionState>; label: ReactNode; pendingLabel?: string; className?: string; confirm?: string; showDetail?: boolean;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState | null>(null);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button type="button" className={className} disabled={pending} onClick={async () => {
        if (confirm && !(await confirmDialog(confirm))) return;
        start(async () => setRes(await action()));
      }}>{pending ? pendingLabel ?? "Working…" : label}</button>
      {res?.ok && <span className="sm tx-green" role="status">{res.ok}</span>}
      {res?.error && <span className="sm tx-red" role="alert">{res.error}</span>}
      {res?.secret && <code className="code" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{res.secret}</code>}
      {showDetail && res?.detail && <pre className="code" style={{ maxWidth: 560, whiteSpace: "pre-wrap" }}>{res.detail}</pre>}
    </span>
  );
}

export function Field({ label, name, hint, children }: { label: string; name: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Toggle({ name, label, defaultChecked, hint, disabled }: { name: string; label: string; defaultChecked?: boolean; hint?: string; disabled?: boolean }) {
  return (
    <label className="row" style={{ gap: 10, alignItems: "flex-start", cursor: disabled ? "not-allowed" : "pointer" }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} style={{ marginTop: 2 }} />
      <span><span style={{ fontWeight: 500 }}>{label}</span>{hint && <span className="hint" style={{ display: "block" }}>{hint}</span>}</span>
    </label>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* blocked */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}
