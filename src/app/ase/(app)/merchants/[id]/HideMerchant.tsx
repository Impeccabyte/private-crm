"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye } from "lucide-react";
import { confirmDialog, notify } from "@/components/confirm";
import { hideMerchants, unhideMerchants } from "../actions";

export function HideMerchantButton({ merchantId, dbaName }: { merchantId: string; dbaName: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const router = useRouter();
  const onClick = async () => {
    const ok = await confirmDialog(
      "It disappears from the merchant list, search, pickers and exports. Nothing is deleted here or in Maverick, and you can unhide it from Merchants → Hidden.",
      { title: `Hide ${dbaName}?`, confirmLabel: "Hide merchant" },
    );
    if (!ok) return;
    start(async () => {
      const r = await hideMerchants([merchantId]);
      setMsg(r.error ? r : null);
      if (r.ok) { notify(r.ok); router.refresh(); }
    });
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button type="button" className="btn" onClick={onClick} disabled={pending}><EyeOff size={14} aria-hidden="true" />{pending ? "Hiding…" : "Hide"}</button>
      {msg?.error && <span className="sm tx-red" role="alert" style={{ maxWidth: 360, textAlign: "right" }}>{msg.error}</span>}
    </span>
  );
}

export function UnhideButton({ merchantId }: { merchantId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="row" style={{ gap: 8 }}>
      <button type="button" className="btn sm" disabled={pending} onClick={() => start(async () => {
        const r = await unhideMerchants([merchantId]);
        if (r.error) setErr(r.error); else { notify(r.ok ?? "Visible again."); router.refresh(); }
      })}><Eye size={14} aria-hidden="true" />{pending ? "Unhiding…" : "Unhide"}</button>
      {err && <span className="sm tx-red" role="alert">{err}</span>}
    </span>
  );
}
