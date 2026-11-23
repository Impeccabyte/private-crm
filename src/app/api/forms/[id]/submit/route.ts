/**
 * Public submit endpoint for lead forms. Accepts the form's POST (fetch or plain HTML), runs the anti-spam checks,
 * validates against the form definition, and creates or updates a lead.
 * JSON callers get { ok, redirect } / { errors } / { error }; plain form posts get a redirect or a short HTML page.
 */
import { requestIp } from "@/lib/session";
import { fmtBytes, MAX_FILE_BYTES, MAX_REQUEST_BYTES, sniff, cleanName } from "@/lib/files";
import { scanBuffer, scannerConfigured, ScannerUnavailable } from "@/lib/clamav";
import { audit } from "@/lib/audit";
import { validateSubmission } from "@/lib/lead-forms/types";
import { allowedDomains, appUrl, checkToken, formByPublicId, hostAllowed, ipHash, rateLimited, recordSubmission } from "@/lib/lead-forms/server";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const reply = (status: number, body: Record<string, unknown>, back?: string) => wantsJson
    ? Response.json(body, { status })
    : new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:15px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px"><p>${esc(String(body.error ?? "Please check the form and try again."))}</p>${back ? `<p><a href="${esc(back)}">Back to the form</a></p>` : ""}`, { status, headers: { "content-type": "text/html; charset=utf-8" } });

  const form = await formByPublicId(id);
  if (!form || form.status !== "published" || form.archivedAt) return reply(404, { error: "This form isn’t available." });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return reply(413, { error: "The files are too large. Attach up to 25 MB in total." });
  const input: Record<string, string> = {};
  const uploads = new Map<string, File[]>();
  try {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") input[k] = v.slice(0, 6000);
      else if (v.size > 0) uploads.set(k, [...(uploads.get(k) ?? []), v]);
    }
  } catch {
    return reply(400, { error: "Couldn’t read the form. If you attached files, keep them under 25 MB in total." });
  }
  const embed = input.embed === "1";
  const back = `/f/${form.publicId}${embed ? "?embed=1" : ""}`;
  const okResponse = () => wantsJson
    ? Response.json({ ok: true, redirect: form.settings.redirectUrl || undefined })
    // Absolute URL from APP_URL: inside Docker, req.url's host is the container's bind address.
    : Response.redirect(!embed && form.settings.redirectUrl ? form.settings.redirectUrl : `${appUrl()}${back}${embed ? "&" : "?"}sent=1`, 303);

  // Bots: filled honeypot or impossibly fast → pretend it worked, store nothing.
  if (input.website_url) return okResponse();
  const t = checkToken(form.publicId, input.t ?? "");
  if (t === "too_fast") return okResponse();
  if (t !== "ok") return reply(400, { error: t === "expired" ? "This form was open too long. Reload the page and try again." : "Reload the page and try again." }, back);

  let host = "";
  try { host = input.page_url ? new URL(input.page_url).host : ""; } catch { /* ignore */ }
  if (host && !hostAllowed(host, allowedDomains(form.settings))) return reply(403, { error: "This form can’t be submitted from this site." });

  const hash = ipHash(await requestIp());
  if (await rateLimited(form.id, hash)) return reply(429, { error: "Too many submissions. Please wait a few minutes and try again." }, back);

  const { errors, values } = validateSubmission(form.fields, form.settings, input);

  // Files: count, size, and real type (checked from the content, not the name).
  const files: { fieldId: string; fieldLabel: string; name: string; mime: string; data: Buffer; scanStatus: "clean" | "pending" | "unscanned"; scanResult: string | null }[] = [];
  let total = 0;
  for (const f of form.fields.filter((x) => x.type === "file")) {
    const list = uploads.get(`f_${f.id}`) ?? [];
    const max = f.maxFiles ?? 3;
    if (f.required && !list.length) { errors[f.id] = "Please attach a file."; continue; }
    if (list.length > max) { errors[f.id] = `You can attach up to ${max} file${max > 1 ? "s" : ""}.`; continue; }
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) { errors[f.id] = `“${file.name}” is ${fmtBytes(file.size)}; the limit is 10 MB.`; break; }
      const data = Buffer.from(await file.arrayBuffer());
      const kind = sniff(data, file.name);
      if (!kind) { errors[f.id] = `“${file.name}” isn’t a PDF, image, CSV or Excel file.`; break; }
      total += data.length;
      const name = cleanName(file.name, kind.ext);
      // Virus scan before anything is stored. Infected → refused outright. Scanner down → held as pending.
      let scanStatus: "clean" | "pending" | "unscanned" = "unscanned", scanResult: string | null = null;
      if (scannerConfigured()) {
        try {
          const r = await scanBuffer(data);
          if (r.status === "infected") {
            console.warn(`[lead-forms] blocked infected upload on ${form.publicId}: ${r.signature}`);
            await audit(null, "file.blocked", "lead_form", form.id, { name, signature: r.signature, size: data.length, pageUrl: input.page_url || null });
            errors[f.id] = `“${name}” didn’t pass our security scan. Remove it and try again.`;
            break;
          }
          scanStatus = "clean"; scanResult = "OK";
        } catch (err) {
          if (!(err instanceof ScannerUnavailable)) throw err;
          console.warn("[lead-forms] scanner unavailable; holding upload as pending:", err.message);
          scanStatus = "pending"; scanResult = err.message;
        }
      }
      files.push({ fieldId: f.id, fieldLabel: f.label, name, mime: kind.mime, data, scanStatus, scanResult });
    }
  }
  if (total > 25 * 1024 * 1024) return reply(413, { error: "The files are too large. Attach up to 25 MB in total." }, back);
  if (Object.keys(errors).length) return wantsJson ? Response.json({ errors }, { status: 422 }) : reply(422, { error: Object.values(errors)[0]! }, back);

  try {
    await recordSubmission(form, values, { ipHash: hash, userAgent: req.headers.get("user-agent"), pageUrl: input.page_url || null }, files);
  } catch (err) {
    console.error("[lead-forms] submission failed", (err as Error).message);
    return reply(500, { error: "Something went wrong on our side. Please try again." }, back);
  }
  return okResponse();
}
