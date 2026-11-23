/**
 * Public, hosted lead form: /f/{publicId}. Plain HTML (no app bundle) so it loads fast inside an iframe.
 * Sets its own CSP: scripts only by nonce, and frame-ancestors limited to the form's allowed domains.
 */
import { randomBytes } from "node:crypto";
import { getSetting } from "@/lib/settings";
import { renderFormHtml } from "@/lib/lead-forms/render";
import { allowedDomains, formByPublicId, frameAncestors, hostAllowed, issueToken } from "@/lib/lead-forms/server";

export const dynamic = "force-dynamic";

const page = (html: string, status: number, frame: string, nonce: string) => new Response(html, {
  status,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors ${frame}`,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  },
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const embed = url.searchParams.get("embed") === "1";
  const nonce = randomBytes(16).toString("base64");
  const g = await getSetting("general");
  const form = await formByPublicId(id);
  const unavailable = (msg: string) => page(renderFormHtml({ publicId: id, name: "Form", fields: [], settings: { title: "", intro: "" } as never }, { action: "#", embed, nonce, defaultAccent: g.accentColor, notice: msg }), 404, "*", nonce);
  if (!form || form.status !== "published" || form.archivedAt) return unavailable("This form isn’t available.");

  // Soft check of the embedding page (reported by the embed script); the CSP frame-ancestors is the hard check.
  const pageUrl = (url.searchParams.get("page") ?? "").slice(0, 500);
  let host = "";
  try { host = pageUrl ? new URL(pageUrl).host : ""; } catch { /* ignore */ }
  if (host && !hostAllowed(host, allowedDomains(form.settings))) return unavailable("This form can’t be shown on this site.");

  const html = renderFormHtml(form, {
    action: `/api/forms/${form.publicId}/submit`, token: issueToken(form.publicId), embed, nonce, pageUrl,
    sent: url.searchParams.get("sent") === "1", defaultAccent: g.accentColor,
  });
  return page(html, 200, frameAncestors(form.settings), nonce);
}
