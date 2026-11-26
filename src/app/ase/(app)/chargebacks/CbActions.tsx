"use client";

import { confirmDialog } from "@/components/confirm";
import { useState, useTransition } from "react";
import { acceptChargeback, submitDispute } from "./actions";
import type { ActionState } from "@/components/forms";

export function CbActions({ id, hasDraft, submitted }: { id: string; hasDraft: boolean; submitted: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
        <button className="btn danger" disabled={pending} onClick={async () => {
          if (!(await confirmDialog("The merchant loses the disputed amount.", { title: "Accept this chargeback?", confirmLabel: "Accept chargeback", danger: true }))) return;
          start(async () => {
          let r = await acceptChargeback(id, false);
          if (r.error === "CONFIRM") r = (await confirmDialog("This accepts the chargeback in Maverick.", { title: "Accept in Maverick?", confirmLabel: "Accept", danger: true })) ? await acceptChargeback(id, true) : {};
          setRes(r);
          });
        }}>Accept</button>
        <div className="row">
          <a className="btn" href="#dispute">Build dispute response</a>
          <button className="btn pri" disabled={pending || !hasDraft || submitted} title={hasDraft ? "" : "Build the dispute response first"} onClick={() => start(async () => setRes(await submitDispute(id)))}>{submitted ? "Submitted" : "Submit"}</button>
        </div>
      </div>
      {res?.ok && <span className="sm tx-green" role="status">{res.ok}</span>}
      {res?.error && <span className="sm tx-red" role="alert">{res.error}</span>}
    </div>
  );
}
