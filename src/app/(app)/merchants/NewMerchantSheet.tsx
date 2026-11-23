"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { Sheet } from "@/components/list";
import { createMerchant, type MerchantFormState } from "./actions";
import { DuplicateBanner } from "@/components/DuplicateBanner";

export function NewMerchantSheet({ closeHref, agents }: { closeHref: string; agents: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<MerchantFormState, FormData>(createMerchant, {});
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  const inp = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, full = false) => (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={`nm-${name}`}>{label}</label>
      <input id={`nm-${name}`} name={name} className={`inp ${fe[name] ? "err" : ""}`} defaultValue={v[name] ?? ""} aria-invalid={!!fe[name]} {...props} />
      {fe[name] && <span className="errt"><AlertTriangle size={12} aria-hidden="true" />{fe[name]}</span>}
    </div>
  );
  return (
    <Sheet title="New merchant" sub="Creates a prospect · board it later with an application" closeHref={closeHref}>
      <form action={action} className="stack" noValidate>
        {state.duplicates && state.duplicates.length > 0 && <DuplicateBanner incoming={v} matches={state.duplicates} createAnywayName="confirmDuplicate" />}
        {state.error && <div className="notice flash-err" role="alert">{state.error}</div>}
        <div className="form-grid">
          {inp("dbaName", "DBA name", { required: true, autoFocus: true }, true)}
          {inp("legalName", "Legal name", { required: true }, true)}
          {inp("ein", "EIN", { placeholder: "12-3456789", inputMode: "numeric", autoComplete: "off" })}
          {inp("mcc", "MCC", { placeholder: "5812", inputMode: "numeric" })}
          {inp("industry", "Industry")}
          {inp("website", "Website")}
          {inp("street", "Street", {}, true)}
          {inp("city", "City")}
          <div className="form-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>{inp("state", "State", { maxLength: 2 })}{inp("zip", "ZIP")}</div>
          {inp("csPhone", "Customer-service phone", { type: "tel" })}
          {inp("csEmail", "Customer-service email", { type: "email" })}
          {inp("contactFirst", "Primary contact first name")}
          {inp("contactLast", "Last name")}
          {inp("contactEmail", "Contact email", { type: "email" })}
          {inp("contactPhone", "Contact phone", { type: "tel" })}
          {agents.length > 0 && (
            <div className="field full"><label htmlFor="nm-owner">Owner agent</label>
              <select id="nm-owner" name="ownerId" className="inp" defaultValue={v.ownerId ?? ""}><option value="">Me</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </div>
          )}
        </div>
        <div className="hint">The EIN is encrypted. Only the last 4 digits are shown afterwards.</div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Link className="btn" href={closeHref}>Cancel</Link>
          <button className="btn pri" type="submit" disabled={pending}>{pending ? "Checking…" : "Create merchant"}</button>
        </div>
      </form>
    </Sheet>
  );
}
