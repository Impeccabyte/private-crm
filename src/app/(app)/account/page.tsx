import { requireUser } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { changePassword, updateName } from "./actions";
import { AvatarEditor } from "./AvatarEditor";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const sec = await getSetting("security");
  return (
    <div className="content" style={{ maxWidth: 720 }}>
      <PageHeader title="Account" sub={`${user.name} · ${user.email} · ${ROLE_LABEL[user.role]}`} />
      <section className="card">
        <div className="card-h"><h2>Profile</h2><span className="subtle sm">Shown to everyone in the CRM</span></div>
        <div className="card-b stack">
          <AvatarEditor name={user.name} initials={user.initials} color={user.avatarColor} avatarKey={user.avatarKey} />
          <ActionForm action={updateName} submitLabel="Save name" className="stack">
            <Field label="Name" name="name"><input id="name" name="name" className="inp" autoComplete="name" defaultValue={user.name} maxLength={80} required /></Field>
          </ActionForm>
        </div>
      </section>
      <section className="card">
        <div className="card-h"><h2>Change password</h2><span className="subtle sm">Signs out your other sessions</span></div>
        <div className="card-b">
          <ActionForm action={changePassword} submitLabel="Update password" className="stack" resetOnOk>
            <input type="hidden" name="username" autoComplete="username" value={user.email} readOnly />
            <Field label="Current password" name="current"><input id="current" name="current" type="password" className="inp" autoComplete="current-password" /></Field>
            <Field label="New password" name="password" hint={`At least ${sec.passwordMinLength} characters, with letters and numbers.`}><input id="password" name="password" type="password" className="inp" autoComplete="new-password" /></Field>
            <Field label="Confirm new password" name="confirm"><input id="confirm" name="confirm" type="password" className="inp" autoComplete="new-password" /></Field>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
