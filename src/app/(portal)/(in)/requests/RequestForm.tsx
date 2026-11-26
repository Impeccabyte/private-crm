"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createRequest, type RequestState } from "../actions";

type Kind = "support" | "equipment" | "account_change" | "trip" | "dispute";

function F({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mp-field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {children}
      {error && <span className="err" id={`${id}-err`}>{error}</span>}
    </div>
  );
}
const aria = (id: string, error?: string, hint?: boolean) => ({
  id, name: id, "aria-invalid": error ? true : undefined,
  "aria-describedby": [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined,
});

export function RequestForm({ kind, chargeback, defaults }: { kind: Kind; chargeback?: { id: string; label: string }; defaults: { subject?: string; what?: string; shipTo: string } }) {
  const [st, action, pending] = useActionState<RequestState, FormData>(createRequest, {});
  const e = st.fieldErrors ?? {};
  const v = st.values ?? {};
  const val = (k: string, d = "") => v[k] ?? d;

  return (
    <form action={action} className="mp-form" noValidate>
      <input type="hidden" name="kind" value={kind} />
      {st.error && <p className="mp-callout bad" role="alert">{st.error}</p>}

      {kind === "support" && (
        <>
          <F id="subject" label="What's it about?" error={e.subject}><input className="mp-input" {...aria("subject", e.subject)} defaultValue={val("subject", defaults.subject ?? "")} maxLength={140} /></F>
          <F id="message" label="Tell us more" hint="Dates, amounts and what you've tried help us answer faster." error={e.message}><textarea className="mp-textarea" {...aria("message", e.message, true)} defaultValue={val("message")} /></F>
        </>
      )}

      {kind === "equipment" && (
        <>
          <div className="two">
            <F id="what" label="What do you need?" error={e.what}>
              <select className="mp-select" {...aria("what", e.what)} defaultValue={val("what")}>
                <option value="">Choose one</option>
                <option>Paper rolls</option>
                <option>A replacement for a broken terminal</option>
                <option>An extra terminal or card reader</option>
                <option>Something else</option>
              </select>
            </F>
            <F id="qty" label="How many?" error={e.qty}><input className="mp-input" type="number" min={1} max={50} inputMode="numeric" {...aria("qty", e.qty)} defaultValue={val("qty", "1")} /></F>
          </div>
          <F id="shipTo" label="Ship to" hint="Change this if it should go somewhere other than your business address."><input className="mp-input" {...aria("shipTo", undefined, true)} defaultValue={val("shipTo", defaults.shipTo)} /></F>
          <F id="message" label="Anything else we should know?" hint="For a broken terminal, tell us what it's doing. Your account manager will confirm any cost before anything ships."><textarea className="mp-textarea" {...aria("message", undefined, true)} defaultValue={val("message")} /></F>
        </>
      )}

      {kind === "account_change" && <AccountChange e={e} val={val} initial={defaults.what ?? ""} />}

      {kind === "trip" && (
        <>
          <p className="mp-callout sm">Travel planning is a perk for Impeccabyte merchants. We&apos;re an independent travel advisor hosted by Fora Travel, and your account manager plans the trip with you. Hotel perks vary by hotel, and upgrades are only when available.</p>
          <F id="destination" label="Where to?" error={e.destination}><input className="mp-input" {...aria("destination", e.destination)} defaultValue={val("destination")} placeholder="City, region or hotel you have in mind" /></F>
          <div className="two">
            <F id="start" label="Check-in" error={e.start}><input className="mp-input" type="date" {...aria("start", e.start)} defaultValue={val("start")} /></F>
            <F id="end" label="Check-out" error={e.end}><input className="mp-input" type="date" {...aria("end", e.end)} defaultValue={val("end")} /></F>
          </div>
          <div className="two">
            <F id="travelers" label="How many people?"><input className="mp-input" type="number" min={1} max={20} inputMode="numeric" {...aria("travelers")} defaultValue={val("travelers", "2")} /></F>
            <div className="mp-field" style={{ justifyContent: "flex-end" }}><label className="mp-check" style={{ fontWeight: 500 }}><input type="checkbox" name="flexible" defaultChecked={v.flexible === "on"} /> My dates are flexible</label></div>
          </div>
          <F id="message" label="What kind of trip is it?" hint="A conference, a weekend away, a family visit. Tell us what matters: location, budget, a pool, quiet rooms."><textarea className="mp-textarea" {...aria("message", undefined, true)} defaultValue={val("message")} /></F>
        </>
      )}

      {kind === "dispute" && chargeback && (
        <>
          <input type="hidden" name="chargeback" value={chargeback.id} />
          <p className="mp-callout sm">About the dispute: {chargeback.label}</p>
          <F id="message" label="What happened with this sale?" hint="What the customer bought, when, and anything they said. If you remember the order number or the customer's name, include it." error={e.message}><textarea className="mp-textarea" {...aria("message", e.message, true)} defaultValue={val("message")} /></F>
          <label className="mp-check"><input type="checkbox" name="hasProof" defaultChecked={v.hasProof === "on"} /> I have a receipt, invoice, signed slip or delivery confirmation for it</label>
          <p className="sm muted">We&apos;ll reply with how to send any proof you have and handle the response with the card network.</p>
        </>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="mp-btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
        <Link className="mp-btn ghost" href="/requests">Cancel</Link>
      </div>
    </form>
  );
}

function AccountChange({ e, val, initial }: { e: Record<string, string>; val: (k: string, d?: string) => string; initial: string }) {
  // Show the bank fields only when that's the change chosen; the server re-checks either way.
  const [what, setWhat] = useState(val("what", initial));
  return (
    <>
      <F id="what" label="What would you like to change?" error={e.what}>
        <select className="mp-select" {...aria("what", e.what)} value={what} onChange={(ev) => setWhat(ev.currentTarget.value)}>
          <option value="">Choose one</option>
          <option>Deposit bank account</option>
          <option>Business name or address</option>
          <option>Phone or email</option>
          <option>Add a location</option>
          <option>Owners or signers</option>
          <option>Something else</option>
        </select>
      </F>
      {what === "Deposit bank account" && <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <legend className="sr">New deposit bank account</legend>
        <F id="bankName" label="Bank name" error={e.bankName}><input className="mp-input" {...aria("bankName", e.bankName)} defaultValue={val("bankName")} autoComplete="off" /></F>
        <div className="two">
          <F id="routing" label="Routing number" error={e.routing}><input className="mp-input" inputMode="numeric" {...aria("routing", e.routing)} autoComplete="off" /></F>
          <F id="account" label="Account number" error={e.account}><input className="mp-input" inputMode="numeric" {...aria("account", e.account)} autoComplete="off" /></F>
        </div>
        <p className="sm muted">These are encrypted and only seen by the team member making the change. For your protection we&apos;ll confirm with you by phone and may ask for a voided check before anything changes.</p>
      </fieldset>}
      <F id="message" label="What should change?" hint="Nothing changes until we've checked it with you." error={e.message}><textarea className="mp-textarea" {...aria("message", e.message, true)} defaultValue={val("message")} /></F>
    </>
  );
}
