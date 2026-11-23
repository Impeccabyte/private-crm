"use client";

import { confirmDialog } from "@/components/confirm";
import { useState, useTransition } from "react";
import { Copy, RefreshCw, Send, PenLine, ChevronDown } from "lucide-react";
import { getCompletionLink, markSignedManually, refreshChecks, sendEsign, setSection, setStatus, toggleCondition, toggleDocument } from "../actions";
import type { ActionState } from "@/components/forms";

function useAction() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState | null>(null);
  /** Runs a processor write; if the connection requires confirmation, asks and retries once. */
  const run = (fn: (confirmed: boolean) => Promise<ActionState>, confirmText?: string) => start(async () => {
    let r = await fn(false);
    if (r.error === "CONFIRM") {
      if (!(await confirmDialog(confirmText ?? "This sends a change to Maverick.", { title: "Send to Maverick?", confirmLabel: "Send" }))) { setRes(null); return; }
      r = await fn(true);
    }
    setRes(r);
  });
  return { pending, res, run };
}

export function AppActions({ appId, status, blockers }: { appId: string; status: string; blockers: string[] }) {
  const { pending, res, run } = useAction();
  const [menu, setMenu] = useState(false);
  const canSubmit = ["New", "Pending"].includes(status);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <span className="row" style={{ gap: 6 }}>
        {status === "New" && <button className="btn" disabled={pending} onClick={() => run(() => setStatus(appId, "Pending"))}>Move to Pending</button>}
        {canSubmit && (
          <span className="tipw">
            <button className={`btn pri ${blockers.length ? "dis" : ""}`} aria-disabled={blockers.length > 0} aria-describedby="submit-why" disabled={pending}
              onClick={() => { if (!blockers.length) run((c) => setStatus(appId, "Underwriting", c), "Submit this application to Maverick underwriting?"); }}>
              <Send size={14} aria-hidden="true" />Submit to Underwriting
            </button>
            {blockers.length > 0 && (
              <span className="tip right" role="tooltip" id="submit-why" style={{ width: 320 }}>
                <b style={{ display: "block", marginBottom: 4 }}>{blockers.length} item{blockers.length > 1 ? "s" : ""} left before you can submit</b>
                {blockers.map((b) => <span key={b} style={{ display: "block" }}>• {b}</span>)}
              </span>
            )}
          </span>
        )}
        {status === "Underwriting" && (
          <span className="rel">
            <button className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>Record decision<ChevronDown size={12} aria-hidden="true" /></button>
            {menu && (
              <span className="pop" role="menu" style={{ display: "block", width: 200 }}>
                <button className="mi" role="menuitem" onClick={() => { setMenu(false); run(() => setStatus(appId, "Approved")); }}>Approved</button>
                <button className="mi" role="menuitem" onClick={() => { setMenu(false); run(() => setStatus(appId, "Declined")); }}>Declined</button>
              </span>
            )}
          </span>
        )}
        {!["Declined", "Cancelled", "Approved"].includes(status) && (
          <button className="btn ghost" disabled={pending} onClick={async () => { if (await confirmDialog("The application moves to Cancelled. You can’t undo this from the CRM.", { title: "Cancel this application?", confirmLabel: "Cancel application", cancelLabel: "Keep it", danger: true })) run(() => setStatus(appId, "Cancelled")); }}>Cancel application</button>
        )}
      </span>
      {canSubmit && blockers.length > 0 && <span className="sm muted">Submit is disabled: {blockers.length} item{blockers.length > 1 ? "s" : ""} left (hover for details)</span>}
      {res?.ok && <span className="sm tx-green" role="status">{res.ok}</span>}
      {res?.error && <span className="sm tx-red" role="alert">{res.error}</span>}
    </span>
  );
}

export function SignatureActions({ appId, signed }: { appId: string; signed: boolean }) {
  const { pending, res, run } = useAction();
  return (
    <>
      <button className="btn" style={{ justifyContent: "flex-start" }} disabled={pending || signed} onClick={() => run((c) => sendEsign(appId, c), "Send an e-sign request through Maverick?")}>
        <Send size={14} aria-hidden="true" />Send e-sign request<span className="sp" /><span className="subtle sm">To unsigned principals</span>
      </button>
      <button className="btn" style={{ justifyContent: "flex-start" }} disabled={pending} onClick={() => run(async () => {
        const r = await getCompletionLink(appId);
        if (r.url) { try { await navigator.clipboard.writeText(r.url); } catch { return { ok: `Completion link: ${r.url}` }; } }
        return r;
      })}>
        <Copy size={14} aria-hidden="true" />Copy merchant completion link
      </button>
      <button className="btn" style={{ justifyContent: "flex-start" }} disabled={pending || signed} onClick={async () => { if (await confirmDialog("Only do this when you have the signed PDF.", { title: "Mark every signer as signed?", confirmLabel: "Mark signed" })) run(() => markSignedManually(appId)); }}>
        <PenLine size={14} aria-hidden="true" />Mark signed manually…<span className="sp" /><span className="subtle sm">Requires signed PDF</span>
      </button>
      {res?.ok && <span className="sm tx-green" role="status">{res.ok}</span>}
      {res?.error && <span className="sm tx-red" role="alert">{res.error}</span>}
    </>
  );
}

export function SectionEditor({ appId, sectionKey, state, summary }: { appId: string; sectionKey: string; state: string; summary: string }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(state);
  const [sum, setSum] = useState(summary);
  const [pending, start] = useTransition();
  if (!open) return <button className="btn ghost sm" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 6, width: 260 }}>
      <select className="inp" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Section state"><option value="complete">Complete</option><option value="partial">In progress</option><option value="missing">Missing items</option></select>
      <input className="inp" value={sum} onChange={(e) => setSum(e.target.value)} aria-label="Summary" />
      <span className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn sm pri" disabled={pending} onClick={() => start(async () => { await setSection(appId, sectionKey, st as "complete", sum); setOpen(false); })}>Save</button>
      </span>
    </span>
  );
}

export function DocToggle({ appId, docId, uploaded }: { appId: string; docId: string; uploaded: boolean }) {
  const [pending, start] = useTransition();
  return <button className="btn sm" disabled={pending} onClick={() => start(() => toggleDocument(appId, docId, !uploaded))}>{uploaded ? "Mark missing" : "Mark received"}</button>;
}

export function ConditionCheck({ appId, condId, met, label }: { appId: string; condId: string; met: boolean; label: string }) {
  const [pending, start] = useTransition();
  return <input type="checkbox" checked={met} disabled={pending} aria-label={label} onChange={(e) => start(() => toggleCondition(appId, condId, e.target.checked))} />;
}

export function ChecksRefresh({ appId }: { appId: string }) {
  const { pending, res, run } = useAction();
  return (
    <span className="row" style={{ gap: 6 }}>
      {res?.ok && <span className="sm tx-green">{res.ok}</span>}{res?.error && <span className="sm tx-red">{res.error}</span>}
      <button className="btn ghost sm" disabled={pending} onClick={() => run(() => refreshChecks(appId))}><RefreshCw size={14} aria-hidden="true" />Re-run</button>
    </span>
  );
}
