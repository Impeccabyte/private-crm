import { useSyncExternalStore } from "react";
import type { Audience, Block, EmailStyle } from "@/lib/email/types";

/** Everything the builder edits and autosaves. */
export type Doc = { name: string; subject: string; preheader: string; fromName: string; replyTo: string; blocks: Block[]; style: EmailStyle; audience: Audience };

export type Status = "draft" | "scheduled" | "sending" | "sent" | "cancelled";

export type CampaignProps = Doc & {
  id: string; status: Status; scheduledAt: string | null; startedAt: string | null; finishedAt: string | null; lastError: string | null; snapshotted: boolean;
};

export type MailInfo = { fromName: string; fromAddress: string; replyTo: string; postalAddress: string; sendsPerMinute: number };

export type Report = {
  counts: { total: number; sent: number; failed: number; skipped: number; waiting: number; opened: number; clicked: number; unsubscribed: number };
  links: { url: string; clicks: number }[];
  recipients: { id: string; email: string; name: string | null; businessName: string | null; status: string; error: string | null; sentAt: string | null; opens: number; clicks: number; unsubscribed: boolean; leadId: string | null; merchantId: string | null }[];
};

/** Change the document. `key` groups rapid edits of the same thing (typing) into one undo step. */
export type Update = (fn: (d: Doc) => Doc, key?: string) => void;

const noop = () => () => {};
/**
 * A time in the viewer's own timezone, with the zone named ("Nov 25, 2026, 9:30 AM CST"). The schedule field is
 * entered in local time, so it is shown back the same way. On the server (no known zone) it falls back to `fallback`.
 */
export function useLocalTime(iso: string | null, fallback: string): string {
  const onClient = useSyncExternalStore(noop, () => true, () => false);
  if (!iso || !onClient) return fallback;
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/email/images", { method: "POST", body: fd });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error ?? "Couldn’t upload that picture.");
  return j.url;
}
