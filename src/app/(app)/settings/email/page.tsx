import { getSetting } from "@/lib/settings";
import { ActionButton, ActionForm, Field, Toggle } from "@/components/forms";
import { saveEmail, sendTestEmail } from "../actions";

export const metadata = { title: "Settings · Email" };

export default async function EmailSettings() {
  const s = await getSetting("email");
  return (
    <section className="card">
      <div className="card-h"><h2>Email (SMTP)</h2><span className="subtle sm">Invites, password resets, system notices and newsletters</span></div>
      <div className="card-b">
        <ActionForm action={saveEmail} className="stack" footer={<ActionButton action={sendTestEmail} label="Send test email to me" />}>
          <Toggle name="enabled" label="Send email" defaultChecked={s.enabled} hint="When off, invites and resets are created but no email is sent." />
          <div className="form-grid">
            <Field label="SMTP host" name="host" hint="Local Docker uses Mailpit (host “mailpit”, port 1025). View mail at http://localhost:8025."><input id="host" name="host" className="inp" defaultValue={s.host} /></Field>
            <Field label="Port" name="port"><input id="port" name="port" type="number" className="inp" defaultValue={s.port} /></Field>
            <Field label="Username" name="username"><input id="username" name="username" className="inp" defaultValue={s.username} autoComplete="off" /></Field>
            <Field label="Password" name="password" hint={s.passwordEnc ? "A password is saved. Leave blank to keep it." : "No password saved."}>
              <input id="password" name="password" type="password" className="inp" autoComplete="new-password" placeholder={s.passwordEnc ? "••••••••" : ""} />
            </Field>
            <Field label="From address" name="fromAddress"><input id="fromAddress" name="fromAddress" type="email" className="inp" defaultValue={s.fromAddress} /></Field>
            <Field label="From name" name="fromName"><input id="fromName" name="fromName" className="inp" defaultValue={s.fromName} /></Field>
            <Field label="Reply-to address" name="replyTo" hint="Where replies go. Leave blank to use the From address."><input id="replyTo" name="replyTo" type="email" className="inp" defaultValue={s.replyTo} /></Field>
            <Field label="Newsletter send rate (per minute)" name="sendsPerMinute" hint="Keep this inside your mail provider’s limit."><input id="sendsPerMinute" name="sendsPerMinute" type="number" min={1} max={600} className="inp" defaultValue={s.sendsPerMinute} /></Field>
            <div className="field full">
              <label htmlFor="postalAddress">Postal address</label>
              <input id="postalAddress" name="postalAddress" className="inp" defaultValue={s.postalAddress} placeholder="Impeccabyte, 123 Main St, Austin, TX 78701" />
              <span className="hint">Shown in the footer of every newsletter. Newsletters can’t be sent without it.</span>
            </div>
          </div>
          <Toggle name="secure" label="Use TLS (SMTPS, usually port 465)" defaultChecked={s.secure} />
        </ActionForm>
      </div>
    </section>
  );
}
