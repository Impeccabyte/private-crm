/**
 * Unsubscribe. GET only shows a confirmation button, because mail scanners follow links automatically and must
 * not unsubscribe people by accident. POST does it (the page's button, or a mail app's one-click unsubscribe).
 */
import { getSetting } from "@/lib/settings";
import { recipientByToken, resubscribe, unsubscribe } from "@/lib/email/server";
import { esc } from "@/lib/email/render";

export const dynamic = "force-dynamic";

function page(company: string, title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#F1F3F6;color:#1B1F27;font:15px/23px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{width:100%;max-width:440px;background:#fff;border:1px solid #E3E6EB;border-radius:12px;padding:28px}
h1{margin:0 0 8px;font-size:20px;line-height:26px}p{margin:0 0 16px;color:#4A5160}.co{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6B7280;margin:0 0 14px}
button{font:inherit;font-weight:600;height:40px;padding:0 18px;border-radius:8px;border:1px solid #1B1F27;background:#1B1F27;color:#fff;cursor:pointer}
button.q{background:#fff;color:#1B1F27;border-color:#CBD0D8}button:focus-visible{outline:2px solid #5B5BD6;outline-offset:2px}
@media (prefers-color-scheme:dark){body{background:#0C0E12;color:#E8EAEE}main{background:#15181E;border-color:#262B34}p{color:#A6ADBA}button{background:#E8EAEE;color:#0C0E12;border-color:#E8EAEE}button.q{background:#15181E;color:#E8EAEE;border-color:#3A404C}}
</style></head><body><main><div class="co">${esc(company)}</div>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}

const mask = (email: string) => { const [u = "", d = ""] = email.split("@"); return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`; };

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const [g, r] = await Promise.all([getSetting("general"), recipientByToken(token)]);
  if (!r) return page(g.companyName, "Link not found", `<h1>This link isn’t valid</h1><p>It may have been copied incompletely. Use the unsubscribe link in the email itself.</p>`, 404);
  if (r.unsubscribedAt) return page(g.companyName, "Unsubscribed", `<h1>You’re unsubscribed</h1><p>${esc(mask(r.email))} won’t get newsletters from ${esc(g.companyName)}.</p><form method="post"><input type="hidden" name="action" value="resubscribe"><button class="q" type="submit">Subscribe again</button></form>`);
  return page(g.companyName, "Unsubscribe", `<h1>Unsubscribe from our emails?</h1><p>${esc(mask(r.email))} will stop getting newsletters from ${esc(g.companyName)}.</p><form method="post"><input type="hidden" name="action" value="unsubscribe"><button type="submit">Unsubscribe</button></form>`);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const [g, r] = await Promise.all([getSetting("general"), recipientByToken(token)]);
  if (!r) return page(g.companyName, "Link not found", `<h1>This link isn’t valid</h1><p>Use the unsubscribe link in the email itself.</p>`, 404);
  let action = "unsubscribe";
  try { const f = await req.formData(); if (f.get("action") === "resubscribe") action = "resubscribe"; } catch { /* one-click posts may have no readable body */ }
  if (action === "resubscribe") {
    await resubscribe(r);
    return page(g.companyName, "Subscribed", `<h1>You’re subscribed again</h1><p>${esc(mask(r.email))} will keep getting newsletters from ${esc(g.companyName)}.</p>`);
  }
  await unsubscribe(r);
  return page(g.companyName, "Unsubscribed", `<h1>You’re unsubscribed</h1><p>${esc(mask(r.email))} won’t get newsletters from ${esc(g.companyName)}. Changed your mind?</p><form method="post"><input type="hidden" name="action" value="resubscribe"><button class="q" type="submit">Subscribe again</button></form>`);
}
