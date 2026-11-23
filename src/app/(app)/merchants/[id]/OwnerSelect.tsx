"use client";

import { useTransition } from "react";
import { updateMerchantOwner } from "../actions";

export function OwnerSelect({ merchantId, ownerId, agents }: { merchantId: string; ownerId: string | null; agents: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="sr">Owner agent</span>
      <select className="inp" style={{ height: 26, fontSize: 12 }} defaultValue={ownerId ?? ""} disabled={pending} aria-label="Owner agent"
        onChange={(e) => { const v = e.target.value; if (v) start(() => updateMerchantOwner(merchantId, v)); }}>
        <option value="" disabled>Unassigned</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}
