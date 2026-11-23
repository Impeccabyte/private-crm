export const SECTIONS = [
  { key: "business", label: "Business info" },
  { key: "principals", label: "Principals" },
  { key: "processing", label: "Processing" },
  { key: "ach", label: "ACH" },
  { key: "fees", label: "Fees" },
  { key: "equipment", label: "Equipment / Terminals" },
  { key: "documents", label: "Documents" },
  { key: "signature", label: "Signature" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export type SectionState = { state: "complete" | "partial" | "missing"; summary?: string };

type AppLike = { status: string; signatureStatus: string; sections: unknown };
type Doc = { name: string; required: boolean; uploaded: boolean };
type Signer = { name: string; status: string };

/** Reasons the application can't be submitted to underwriting yet (empty = ready). */
export function submitBlockers(app: AppLike, docs: Doc[], signers: Signer[]): string[] {
  const s = (app.sections ?? {}) as Record<string, SectionState>;
  const out: string[] = [];
  if (!["New", "Pending"].includes(app.status)) return [`Already ${app.status.toLowerCase()}`];
  for (const sec of SECTIONS) {
    if (sec.key === "documents" || sec.key === "signature") continue;
    if (s[sec.key]?.state !== "complete") out.push(`${sec.label}: ${s[sec.key]?.summary ?? "not complete"}`);
  }
  const missingDocs = docs.filter((d) => d.required && !d.uploaded);
  if (missingDocs.length) out.push(`Documents: ${missingDocs.map((d) => d.name).join(", ")}`);
  const unsigned = signers.filter((x) => x.status !== "Signed");
  if (app.signatureStatus !== "Signed") out.push(unsigned.length ? `Signature: ${unsigned.map((x) => x.name).join(", ")} hasn’t signed` : "Signature: not signed");
  return out;
}
