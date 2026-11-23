"use client";

/**
 * In-app confirmation dialog, replacing window.confirm. Call `confirmDialog(...)` from any client handler;
 * it resolves true/false. <ConfirmHost /> is mounted once in the app layout.
 */
import { useEffect, useRef, useState } from "react";

/** requireText: the confirm button stays disabled until this exact text is typed (for permanent deletes). */
type Opts = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; requireText?: string };
type Req = Opts & { message: string; resolve: (ok: boolean) => void };

let show: ((r: Req) => void) | null = null;
let toast: ((t: { text: string; error?: boolean }) => void) | null = null;

/** Brief message in the corner (survives the component that triggered it unmounting). */
export function notify(text: string, opts: { error?: boolean } = {}) {
  toast?.({ text, error: opts.error });
}

export function confirmDialog(message: string, opts: Opts = {}): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show!({ ...opts, message, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean; key: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    show = (r) => { returnTo.current = document.activeElement as HTMLElement | null; setTyped(""); setReq(r); };
    toast = (t) => setMsg({ ...t, key: Date.now() });
    return () => { show = null; toast = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.error ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [msg]);

  const done = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
    returnTo.current?.focus?.();
  };

  useEffect(() => {
    if (!req) return;
    (req.requireText ? inputRef.current : okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); done(false); }
      if (e.key === "Tab") {
        // Keep focus inside the two buttons.
        const btns = Array.from(document.querySelectorAll<HTMLElement>(".dlg input, .dlg button:not([disabled])"));
        const i = btns.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  const toastEl = msg && (
    <div key={msg.key} className="toast" role={msg.error ? "alert" : "status"} style={msg.error ? { background: "var(--r-ink)" } : undefined}>
      {msg.text}
      <button type="button" className="btn ghost sm icon" onClick={() => setMsg(null)} aria-label="Dismiss" style={{ color: "inherit", marginLeft: 8 }}>×</button>
    </div>
  );
  if (!req) return toastEl || null;
  const blocked = !!req.requireText && typed.trim() !== req.requireText.trim();
  return (
    <>
    {toastEl}
    <div className="dlg-wrap">
      <div className="scrim" onClick={() => done(false)} aria-hidden="true" />
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
        <h2 id="dlg-t">{req.title ?? "Are you sure?"}</h2>
        <p id="dlg-m">{req.message}</p>
        {req.requireText && (
          <label className="field">
            <span className="lab">Type <b style={{ color: "var(--ink)" }}>{req.requireText}</b> to confirm</span>
            <input ref={inputRef} className="inp" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter" && !blocked) { e.preventDefault(); done(true); } }} />
          </label>
        )}
        <div className="acts">
          <button className="btn" type="button" onClick={() => done(false)}>{req.cancelLabel ?? "Cancel"}</button>
          <button ref={okRef} className={`btn pri ${req.danger ? "danger" : ""}`} type="button" disabled={blocked} onClick={() => done(true)}>{req.confirmLabel ?? "Continue"}</button>
        </div>
      </div>
    </div>
    </>
  );
}
