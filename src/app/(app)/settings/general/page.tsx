import { getSetting } from "@/lib/settings";
import { ActionForm, Field } from "@/components/forms";
import { saveGeneral } from "../actions";

export const metadata = { title: "Settings · General" };

export default async function GeneralSettings() {
  const g = await getSetting("general");
  return (
    <section className="card">
      <div className="card-h"><h2>General</h2><span className="subtle sm">Company, brand color and workflow thresholds</span></div>
      <div className="card-b">
        <ActionForm action={saveGeneral} className="stack">
          <div className="form-grid">
            <Field label="Company name" name="companyName"><input id="companyName" name="companyName" className="inp" defaultValue={g.companyName} required /></Field>
            <Field label="Accent color" name="accentColor" hint="The one brand color used for primary buttons, focus rings and highlights.">
              <div className="row" style={{ gap: 8 }}>
                <input id="accentColor" name="accentColor" className="inp mono" defaultValue={g.accentColor} pattern="#[0-9a-fA-F]{6}" style={{ width: 140 }} />
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 7, background: g.accentColor, border: "1px solid var(--line)" }} />
              </div>
            </Field>
            <Field label="Time zone" name="timezone" hint="Used for SLA timers and report periods.">
              <select id="timezone" name="timezone" className="inp" defaultValue={g.timezone}>
                {["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "UTC"].map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
          </div>
          <hr className="divider" />
          <div className="sec-t">Needs-attention thresholds</div>
          <div className="form-grid">
            <Field label="Application stuck after (days in one status)" name="stuckApplicationDays"><input id="stuckApplicationDays" name="stuckApplicationDays" type="number" min={1} className="inp" defaultValue={g.stuckApplicationDays} /></Field>
            <Field label="Chargeback urgent when due within (days)" name="chargebackUrgentDays"><input id="chargebackUrgentDays" name="chargebackUrgentDays" type="number" min={1} className="inp" defaultValue={g.chargebackUrgentDays} /></Field>
            <Field label="Ticket first-response SLA (minutes)" name="ticketFirstResponseMinutes"><input id="ticketFirstResponseMinutes" name="ticketFirstResponseMinutes" type="number" min={5} className="inp" defaultValue={g.ticketFirstResponseMinutes} /></Field>
            <Field label="Flag ticket as at risk when SLA is within (minutes)" name="ticketSlaWarnMinutes"><input id="ticketSlaWarnMinutes" name="ticketSlaWarnMinutes" type="number" min={1} className="inp" defaultValue={g.ticketSlaWarnMinutes} /></Field>
            <Field label="Lead is stale after (days without activity)" name="staleLeadDays"><input id="staleLeadDays" name="staleLeadDays" type="number" min={1} className="inp" defaultValue={g.staleLeadDays} /></Field>
          </div>
        </ActionForm>
      </div>
    </section>
  );
}
