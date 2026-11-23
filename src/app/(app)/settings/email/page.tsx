import { getSetting } from "@/lib/settings";
import { ActionButton, ActionForm, Field, Toggle } from "@/components/forms";
import { saveEmail, sendTestEmail } from "../actions";

export const metadata = { title: "Settings · Email" };

export default async function EmailSettings() {
  const s = await getSetting("email");
  return (
    <section className="card">
      <div className="card-h"><h2>Email (SMTP)</h2><span className="subtle sm">Invites, password resets and system notices</span></div>
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
          </div>
          <Toggle name="secure" label="Use TLS (SMTPS, usually port 465)" defaultChecked={s.secure} />
        </ActionForm>
      </div>
    </section>
  );
}
