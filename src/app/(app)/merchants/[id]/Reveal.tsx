"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { revealSensitive } from "../../actions";

/** Masked value with a permissioned, audited, time-limited Reveal (30 seconds). */
export function Reveal({ kind, id, masked, allowed }: { kind: "ein" | "bank" | "request_bank"; id: string; masked: string; allowed: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Verifying with processor (Maverick)");
  const [value, setValue] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!value) return;
    setLeft(30);
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(t); setValue(null); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [value]);

  const fmt = (v: string) => (kind === "ein" && /^\d{9}$/.test(v) ? `${v.slice(0, 2)}-${v.slice(2)}` : v);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <span className="row" style={{ gap: 8 }}>
        <span className="mask">{value ? fmt(value) : masked}</span>
        {value ? <span className="subtle sm">hides in {left}s</span>
          : <button type="button" className="lnk" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Eye size={12} aria-hidden="true" />Reveal</button>}
      </span>
      {open && !value && (allowed ? (
        <span className="expand-in" style={{ border: "1px solid var(--line-strong)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, background: "var(--sunken)" }}>
          <span className="row" style={{ gap: 6, fontWeight: 600 }}><ShieldCheck size={14} aria-hidden="true" />Reveal full {kind === "ein" ? "EIN" : kind === "request_bank" ? "bank details" : "account number"}?</span>
          <span className="sm muted">It shows for 30 seconds and is recorded in the audit log with your name, the time and your reason.</span>
          <label className="field"><span className="lab">Reason</span>
            <select className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option>Verifying with processor (Maverick)</option><option>Tax form (1099-K) question</option><option>Merchant requested</option><option>Deposit or funding investigation</option>
            </select>
          </label>
          {err && <span className="sm tx-red" role="alert">{err}</span>}
          <span className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn sm pri" disabled={pending} onClick={() => start(async () => {
              setErr(null);
              const r = await revealSensitive(kind, id, reason);
              if (r.value) { setValue(r.value); setOpen(false); } else setErr(r.error ?? "Couldn’t reveal");
            })}>{pending ? "Checking…" : "Reveal and log"}</button>
          </span>
        </span>
      ) : (
        <span className="banner amber" style={{ padding: "10px 12px" }}>
          <Lock size={14} aria-hidden="true" style={{ marginTop: 3 }} />
          <span><span className="bt sm" style={{ display: "block" }}>You need the “Reveal sensitive data” permission</span><span className="bd sm">Ask an admin. Attempts are logged.</span></span>
        </span>
      ))}
    </span>
  );
}
