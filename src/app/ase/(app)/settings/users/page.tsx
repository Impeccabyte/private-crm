import { asc } from "drizzle-orm";
import { Check, X } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, initialsOf } from "@/lib/dal";
import { matrix, PERMISSION_LABEL, ROLE_LABEL, type Role } from "@/lib/rbac";
import { fmtDate, relTime } from "@/lib/format";
import { Avatar, Pill } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { inviteUser } from "../actions";
import { UserRow } from "./UserRow";

export const metadata = { title: "Settings · Users & roles" };
const ROLES: Role[] = ["admin", "manager", "agent", "onboarding", "support"];

export default async function UsersSettings() {
  const me = await requirePage("users.manage");
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const agents = users.filter((u) => u.role === "agent" && !u.parentAgentId);
  return (
    <>
      <section className="card lv">
        <div className="card-h"><h2>Users <span className="ct">{users.length}</span></h2><span className="subtle sm">Sample users have no password until you send them a link</span></div>
        <div className="tblw">
          <table className="tbl compact">
            <thead><tr><th>Name</th><th>Role</th><th>Reports to</th><th>Status</th><th>Last sign-in</th><th className="w0" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} isSelf={u.id === me.id} canEditAdmins={me.role === "admin"}
                  user={{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, parentAgentId: u.parentAgentId, hasPassword: !!u.passwordHash }}
                  avatar={<Avatar initials={initialsOf(u.name)} color={u.avatarColor} avatarKey={u.avatarKey} />}
                  statusPill={<Pill status={u.status} label={u.status[0]!.toUpperCase() + u.status.slice(1)} />}
                  lastLogin={u.lastLoginAt ? relTime(u.lastLoginAt) : "Never"}
                  agents={agents.filter((a) => a.id !== u.id).map((a) => ({ id: a.id, name: a.name }))} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Invite a user</h2><span className="subtle sm">They get an email link to set a password</span></div>
        <div className="card-b">
          <ActionForm action={inviteUser} submitLabel="Send invite" className="stack" resetOnOk>
            <div className="form-grid">
              <Field label="Full name" name="name"><input id="name" name="name" className="inp" required /></Field>
              <Field label="Work email" name="email"><input id="email" name="email" type="email" className="inp" required /></Field>
              <Field label="Role" name="role">
                <select id="role" name="role" className="inp" defaultValue="agent">
                  {ROLES.filter((r) => r !== "admin" || me.role === "admin").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
              <Field label="Sub-agent of (optional)" name="parentAgentId" hint="Sub-agents roll up to an agent for scoping and residuals.">
                <select id="parentAgentId" name="parentAgentId" className="inp" defaultValue="">
                  <option value="">— None —</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Role permissions</h2><span className="subtle sm">Sales Agents only see their own book and their sub-agents’</span></div>
        <div className="tblw">
          <table className="mx">
            <thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {matrix().map((row) => (
                <tr key={row.perm}>
                  <td style={{ fontWeight: 500 }}>{PERMISSION_LABEL[row.perm]}</td>
                  {ROLES.map((r) => (
                    <td key={r}>{row.roles[r]
                      ? <span className="row tx-green" style={{ justifyContent: "center", gap: 4 }}><Check size={14} aria-hidden="true" />{r === "agent" && /view|edit/.test(row.perm) && !row.perm.startsWith("reports") ? "Own book" : "Yes"}</span>
                      : <span className="row subtle" style={{ justifyContent: "center", gap: 4 }}><X size={14} aria-hidden="true" />No</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-b subtle sm">Updated {fmtDate(new Date())}. Permissions are enforced on the server for every page and action.</div>
      </section>
    </>
  );
}
