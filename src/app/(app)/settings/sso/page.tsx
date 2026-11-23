import { getSetting } from "@/lib/settings";
import { ActionForm, Field, Toggle } from "@/components/forms";
import { Banner } from "@/components/ui";
import { saveSso } from "../actions";

export const metadata = { title: "Settings · Single sign-on" };

export default async function SsoSettings() {
  const s = await getSetting("sso");
  const callback = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/auth/sso/callback`;
  return (
    <section className="card">
      <div className="card-h"><h2>Single sign-on (OpenID Connect)</h2><span className="subtle sm">Google Workspace, Microsoft Entra ID, Okta…</span></div>
      <div className="card-b stack">
        <Banner tone="blue" title={`Redirect URI to register with your identity provider: ${callback}`}>
          Uses the authorization-code flow with PKCE. Users must already exist in the CRM unless auto-provisioning is on. Admins can always use their password.
        </Banner>
        <ActionForm action={saveSso} className="stack">
          <Toggle name="enabled" label="Show “Sign in with …” on the sign-in page" defaultChecked={s.enabled} />
          <div className="form-grid">
            <Field label="Provider name" name="providerName"><input id="providerName" name="providerName" className="inp" defaultValue={s.providerName} /></Field>
            <Field label="Issuer URL" name="issuerUrl" hint="e.g. https://accounts.google.com or https://login.microsoftonline.com/<tenant>/v2.0"><input id="issuerUrl" name="issuerUrl" className="inp" defaultValue={s.issuerUrl} /></Field>
            <Field label="Client ID" name="clientId"><input id="clientId" name="clientId" className="inp" defaultValue={s.clientId} autoComplete="off" /></Field>
            <Field label="Client secret" name="clientSecret" hint={s.clientSecretEnc ? "A secret is saved. Leave blank to keep it." : "No secret saved."}>
              <input id="clientSecret" name="clientSecret" type="password" className="inp" autoComplete="new-password" placeholder={s.clientSecretEnc ? "••••••••" : ""} />
            </Field>
            <Field label="Allowed email domains" name="allowedDomains" hint="Comma-separated, e.g. impeccabyte.com. Leave blank to allow any verified email of an existing user."><input id="allowedDomains" name="allowedDomains" className="inp" defaultValue={s.allowedDomains} /></Field>
            <Field label="Role for auto-provisioned users" name="defaultRole">
              <select id="defaultRole" name="defaultRole" className="inp" defaultValue={s.defaultRole}>
                <option value="agent">Sales Agent</option><option value="onboarding">Onboarding Specialist</option><option value="support">Support Rep</option><option value="manager">Manager</option>
              </select>
            </Field>
          </div>
          <Toggle name="autoProvision" label="Create a CRM user on first SSO sign-in (allowed domains only)" defaultChecked={s.autoProvision} />
          <Toggle name="allowPasswordLogin" label="Allow email/password sign-in for non-admins" defaultChecked={s.allowPasswordLogin} />
        </ActionForm>
      </div>
    </section>
  );
}
