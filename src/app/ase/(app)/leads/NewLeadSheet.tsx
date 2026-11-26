"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle, Link2, Merge } from "lucide-react";
import { Sheet } from "@/components/list";
import { DuplicateBanner } from "@/components/DuplicateBanner";
import { createLead, type LeadFormState } from "./actions";
import { SOURCE_LABEL } from "@/lib/format";

export function NewLeadSheet({ closeHref, agents }: { closeHref: string; agents: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(createLead, {});
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  const inp = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, full = false) => (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={`nl-${name}`}>{label}</label>
      <input id={`nl-${name}`} name={name} className={`inp ${fe[name] ? "err" : ""}`} defaultValue={v[name] ?? ""} aria-invalid={!!fe[name]} {...props} />
      {fe[name] && <span className="errt"><AlertTriangle size={12} aria-hidden="true" />{fe[name]}</span>}
    </div>
  );
  return (
    <Sheet title="New lead" sub="Checked against existing merchants and leads before saving" closeHref={closeHref}>
      <form action={action} className="stack" noValidate>
        {state.duplicates && state.duplicates.length > 0 && (
          <DuplicateBanner incoming={v} matches={state.duplicates} createAnywayName="duplicateDecision"
            onMerge={(m) => m.kind === "lead"
              ? <button className="btn sm pri" type="submit" name="duplicateDecision" value={`merge:${m.id}`}><Merge size={14} aria-hidden="true" />Merge into existing lead</button>
              : <Link className="btn sm pri" href={`/ase/merchants/${m.id}`}><Merge size={14} aria-hidden="true" />Open existing merchant</Link>}
            onLink={(m) => m.kind === "merchant"
              ? <button className="btn sm" type="submit" name="duplicateDecision" value={`link:${m.id}`}><Link2 size={14} aria-hidden="true" />Link as new location</button>
              : null} />
        )}
        {state.error && <div className="notice flash-err" role="alert">{state.error}</div>}
        <div className="form-grid">
          {inp("businessName", "Business name", { required: true, autoFocus: true }, true)}
          {inp("contactName", "Contact name")}
          {inp("phone", "Phone", { type: "tel" })}
          {inp("email", "Email", { type: "email" })}
          {inp("website", "Website")}
          <div className="field"><label htmlFor="nl-source">Source</label>
            <select id="nl-source" name="source" className="inp" defaultValue={v.source || "manual"}>{Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          {inp("mcc", "MCC", { inputMode: "numeric", placeholder: "5812" })}
          {inp("industry", "Industry")}
          {inp("estMonthlyVolume", "Est. monthly volume ($)", { inputMode: "decimal", placeholder: "25000" })}
          {inp("currentProcessor", "Current processor")}
          {inp("ein", "EIN (optional)", { autoComplete: "off", placeholder: "12-3456789" })}
          {agents.length > 0 && (
            <div className="field"><label htmlFor="nl-owner">Owner</label>
              <select id="nl-owner" name="ownerId" className="inp" defaultValue={v.ownerId ?? ""}><option value="">Me</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </div>
          )}
        </div>
        <div className="hint">Only the last 4 digits of the EIN are stored on a lead; they’re used for duplicate matching.</div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Link className="btn" href={closeHref}>Cancel</Link>
          <button className="btn pri" type="submit" disabled={pending}>{pending ? "Checking…" : "Create lead"}</button>
        </div>
      </form>
    </Sheet>
  );
}
