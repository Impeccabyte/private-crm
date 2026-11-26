"use client";

import { ActionButton, ActionForm } from "@/components/forms";
import { invitePortalUser, resendPortalInvite, setPortalUserEnabled } from "../portal-actions";

type PU = { id: string; name: string; email: string; status: "invited" | "active" | "disabled"; lastLoginAt: string | null };

const STATUS: Record<PU["status"], string> = { invited: "Invited", active: "Active", disabled: "Turned off" };

/** Merchant record side panel: who can sign in to the merchant portal for this business. */
export function PortalAccess({ merchantId, users, canEdit, suggest }: { merchantId: string; users: PU[]; canEdit: boolean; suggest: { name: string; email: string } | null }) {
  const live = users.find((u) => u.status !== "disabled");
  return (
    <div className="card-b stack">
      {users.length === 0 && <p className="subtle sm">No one from this business can sign in to the merchant portal yet.</p>}
      {users.map((u) => (
        <div key={u.id} className="stack" style={{ gap: 4, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
            <b>{u.name}</b>
            <span className={`pill t-${u.status === "active" ? "green" : u.status === "invited" ? "amber" : "gray"}`}>{STATUS[u.status]}</span>
          </div>
          <span className="sm muted">{u.email}{u.lastLoginAt ? ` · last sign-in ${new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
          {canEdit && (
            <div className="row w" style={{ gap: 8, marginTop: 4 }}>
              {u.status !== "disabled" && <ActionButton className="btn sm" action={() => resendPortalInvite(u.id)} label={u.status === "active" ? "Send reset link" : "Resend invite"} pendingLabel="Sending…" />}
              <ActionButton className="btn sm ghost" action={() => setPortalUserEnabled(u.id, u.status === "disabled")} label={u.status === "disabled" ? "Turn back on" : "Turn off"}
                confirm={u.status === "disabled" ? undefined : `Turn off portal sign-in for ${u.email}? They'll be signed out right away.`} />
            </div>
          )}
        </div>
      ))}
      {canEdit && !live && (
        <ActionForm action={invitePortalUser} submitLabel="Send invite" className="stack">
          <input type="hidden" name="merchantId" value={merchantId} />
          <label className="field"><span className="lbl">Name</span><input className="inp" name="name" defaultValue={suggest?.name ?? ""} /></label>
          <label className="field"><span className="lbl">Email</span><input className="inp" name="email" type="email" defaultValue={suggest?.email ?? ""} /></label>
          <span className="sm subtle">They get an email to choose a password, then see their deposits, disputes and requests at app.impeccabyte.com. They never see residuals, internal notes or full bank numbers.</span>
        </ActionForm>
      )}
    </div>
  );
}
