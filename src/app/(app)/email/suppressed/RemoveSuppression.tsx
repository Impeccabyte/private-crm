"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog, notify } from "@/components/confirm";
import { removeSuppression } from "../actions";

export function RemoveSuppression({ email, reason }: { email: string; reason: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn sm" type="button" disabled={pending} onClick={async () => {
      const warn = reason === "unsubscribed" ? "This person asked to stop getting newsletters. Only remove them if they’ve told you they want them again." : reason === "rejected" ? "The mail server refused this address. Emails to it will probably fail again." : "They’ll be included in future newsletters.";
      if (!(await confirmDialog(warn, { title: `Remove ${email} from the list?`, confirmLabel: "Remove", danger: reason === "unsubscribed" }))) return;
      start(async () => { const r = await removeSuppression(email); notify(r.ok ?? r.error ?? "", { error: !!r.error }); router.refresh(); });
    }}>Remove</button>
  );
}
