"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { confirmDialog, notify } from "@/components/confirm";
import { hideMerchants, unhideMerchants } from "./actions";

/** Hides (or unhides) the merchants checked in the list's bulk form. Ineligible ones are skipped and listed. */
export function BulkHide({ form, mode }: { form: string; mode: "hide" | "unhide" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = async () => {
    const ids = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"][name=ids]:checked`)).map((i) => i.value);
    if (!ids.length) return;
    if (mode === "hide" && !(await confirmDialog(
      `Only merchants that are still boarding, with a single cancelled application and no MIDs or chargebacks, are hidden. Others are skipped. Nothing is deleted, here or in Maverick.`,
      { title: `Hide ${ids.length} selected merchant${ids.length === 1 ? "" : "s"}?`, confirmLabel: "Hide" },
    ))) return;
    start(async () => {
      const r = mode === "hide" ? await hideMerchants(ids) : await unhideMerchants(ids);
      notify(r.error ?? r.ok ?? "", { error: !!r.error });
      document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"]:checked`).forEach((i) => { i.checked = false; });
      document.dispatchEvent(new Event(`sel-${form}`));
      router.refresh();
    });
  };
  return (
    <>
      <button type="button" className="btn sm" onClick={run} disabled={pending}>
        {mode === "hide" ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        {pending ? (mode === "hide" ? "Hiding…" : "Unhiding…") : mode === "hide" ? "Hide" : "Unhide"}
      </button>
    </>
  );
}
