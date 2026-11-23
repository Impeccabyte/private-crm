import { count, eq, gte, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { scannerConfigured, scannerVersion } from "@/lib/clamav";
import { Pill } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { saveSecurity } from "../actions";

export const metadata = { title: "Settings · Security" };

export default async function SecuritySettings() {
  const s = await getSetting("security");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [scanner, [pending], [blocked], [infected]] = await Promise.all([
    scannerVersion(),
    db.select({ n: count() }).from(schema.files).where(eq(schema.files.scanStatus, "pending")),
    db.select({ n: count() }).from(schema.auditLog).where(and(eq(schema.auditLog.action, "file.blocked"), gte(schema.auditLog.at, since))),
    db.select({ n: count() }).from(schema.files).where(and(eq(schema.files.scanStatus, "infected"), gte(schema.files.createdAt, since))),
  ]);
  const n = (name: keyof typeof s, label: string, hint?: string) => (
    <Field label={label} name={name} hint={hint}><input id={name} name={name} type="number" className="inp" defaultValue={s[name]} /></Field>
  );
  return (
    <>
    <section className="card">
      <div className="card-h"><h2>Security</h2><span className="subtle sm">Sessions, lockout and password policy</span></div>
      <div className="card-b">
        <ActionForm action={saveSecurity} className="stack">
          <div className="form-grid">
            {n("sessionHours", "Session length (hours)", "When “Keep me signed in” is not ticked.")}
            {n("rememberMeDays", "“Keep me signed in” length (days)")}
            {n("lockoutAttempts", "Failed attempts before sign-in pauses")}
            {n("lockoutMinutes", "Pause length (minutes)")}
            {n("passwordMinLength", "Minimum password length")}
            {n("resetTokenMinutes", "Password reset link lifetime (minutes)")}
            {n("inviteTokenHours", "Invite link lifetime (hours)")}
          </div>
        </ActionForm>
      </div>
    </section>

    <section className="card" aria-label="Virus scanning">
      <div className="card-h"><h2>Virus scanning</h2>
        {!scannerConfigured() ? <Pill status="Inactive" label="Not configured" /> : scanner ? <Pill status="Connected" label="Running" /> : <Pill status="Failed" label="Unreachable" />}
      </div>
      <div className="card-b stack" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0 }}>Every file uploaded through a lead form is scanned with ClamAV before it’s stored. Infected files are refused. If the scanner is down, files are held and can’t be downloaded until it scans them.</p>
        <dl className="dl">
          <dt>Scanner</dt><dd>{!scannerConfigured() ? <span className="subtle">Set CLAMAV_HOST to enable (Docker Compose sets it).</span> : scanner ? scanner.engine : <span className="tx-red">Can’t connect to {process.env.CLAMAV_HOST}:{process.env.CLAMAV_PORT || 3310}. On first start it needs a few minutes to download signatures.</span>}</dd>
          {scanner?.signatures && <><dt>Signatures</dt><dd>Version {scanner.signatures}{scanner.updated ? ` · updated ${scanner.updated}` : ""} <span className="subtle sm">(refreshed automatically)</span></dd></>}
          <dt>Waiting to scan</dt><dd className={pending!.n ? "tx-amber" : ""}>{pending!.n} file{pending!.n === 1 ? "" : "s"}</dd>
          <dt>Blocked · 30 days</dt><dd>{blocked!.n + infected!.n} file{blocked!.n + infected!.n === 1 ? "" : "s"}</dd>
        </dl>
      </div>
    </section>
    </>
  );
}
