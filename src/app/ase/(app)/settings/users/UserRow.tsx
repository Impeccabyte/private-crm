"use client";

import { useActionState, useState, type ReactNode } from "react";
import { sendPasswordLink, updateUser } from "../actions";
import type { ActionState } from "@/components/forms";

const ROLES = [["admin", "Admin"], ["manager", "Manager"], ["agent", "Sales Agent"], ["onboarding", "Onboarding Specialist"], ["support", "Support Rep"]] as const;

export function UserRow({ user, avatar, statusPill, lastLogin, agents, isSelf, canEditAdmins }: {
  user: { id: string; name: string; email: string; role: string; status: string; parentAgentId: string | null; hasPassword: boolean };
  avatar: ReactNode; statusPill: ReactNode; lastLogin: string; agents: { id: string; name: string }[]; isSelf: boolean; canEditAdmins: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(updateUser, {});
  const [linkState, linkAction, linkPending] = useActionState<ActionState, FormData>(sendPasswordLink, {});
  const locked = (user.role === "admin" && !canEditAdmins);
  return (
    <>
      <tr>
        <td><span className="who">{avatar}<span><span style={{ display: "block", fontWeight: 500 }}>{user.name}{isSelf ? " (you)" : ""}</span><span className="subtle sm">{user.email}</span></span></span></td>
        <td>{ROLES.find((r) => r[0] === user.role)?.[1]}</td>
        <td className="muted">{agents.find((a) => a.id === user.parentAgentId)?.name ?? "—"}</td>
        <td>{statusPill}{!user.hasPassword && <span className="subtle sm" style={{ marginLeft: 6 }}>no password</span>}</td>
        <td className="muted">{lastLogin}</td>
        <td><button className="btn sm" onClick={() => setEditing((e) => !e)} disabled={locked} aria-expanded={editing}>{editing ? "Close" : "Edit"}</button></td>
      </tr>
      {editing && (
        <tr className="expand-in">
          <td colSpan={6} style={{ background: "var(--sunken)", height: "auto", padding: 12, whiteSpace: "normal" }}>
            <div className="row w" style={{ gap: 16, alignItems: "flex-end" }}>
              <form action={action} className="row w" style={{ gap: 10, alignItems: "flex-end" }}>
                <input type="hidden" name="id" value={user.id} />
                <div className="field"><label htmlFor={`r-${user.id}`}>Role</label>
                  <select id={`r-${user.id}`} name="role" className="inp" defaultValue={user.role} disabled={isSelf}>
                    {ROLES.filter((r) => r[0] !== "admin" || canEditAdmins).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {isSelf && <input type="hidden" name="role" value={user.role} />}
                </div>
                <div className="field"><label htmlFor={`s-${user.id}`}>Status</label>
                  <select id={`s-${user.id}`} name="status" className="inp" defaultValue={user.status} disabled={isSelf}>
                    <option value="active">Active</option><option value="invited">Invited</option><option value="disabled">Disabled</option>
                  </select>
                  {isSelf && <input type="hidden" name="status" value={user.status} />}
                </div>
                <div className="field"><label htmlFor={`p-${user.id}`}>Sub-agent of</label>
                  <select id={`p-${user.id}`} name="parentAgentId" className="inp" defaultValue={user.parentAgentId ?? ""}>
                    <option value="">— None —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <button className="btn pri sm" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
              </form>
              <form action={linkAction}>
                <input type="hidden" name="id" value={user.id} />
                <button className="btn sm" type="submit" disabled={linkPending}>{user.hasPassword ? "Send password reset link" : "Send invite link"}</button>
              </form>
            </div>
            {(state.ok || state.error || linkState.ok || linkState.error) && (
              <div className={`sm ${state.error || linkState.error ? "tx-red" : "tx-green"}`} role="status" style={{ marginTop: 8 }}>{state.error ?? state.ok ?? linkState.error ?? linkState.ok}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
