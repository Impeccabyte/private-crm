/**
 * Turns a newsletter definition into email HTML (tables + inline styles, 600px wide, so it survives Outlook and
 * Gmail) and a plain-text alternative. Pure: the builder preview and the send job call the same function.
 */
import { FONT_STACK, SOCIAL_LABEL, type Align, type Block, type Cell, type EmailStyle, DEFAULT_STYLE } from "./types";
import { richToText, safeHref, sanitizeRich } from "./sanitize";

export type RenderOpts = {
  /** Values for {{first_name}}, {{name}}, {{business_name}}, {{company}}. */
  merge: Record<string, string>;
  companyName: string;
  postalAddress: string;
  unsubscribeUrl: string;
  viewUrl?: string;
  /** 1×1 open-tracking image. */
  pixelUrl?: string;
  /** Rewrites a web link to its click-tracking address. Not called for mailto:/tel: links. */
  link?: (url: string) => string;
};

export type RenderInput = { subject: string; preheader: string; blocks: Block[]; style: Partial<EmailStyle> };

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const hex = (s: unknown, fallback: string) => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s) ? s : fallback);
const pick = <T,>(table: Record<string, T>, key: unknown, fallback: T): T => (typeof key === "string" && Object.hasOwn(table, key) ? table[key]! : fallback);
const ALIGN: Record<string, Align> = { left: "left", center: "center", right: "right" };
const RADIUS: Record<string, string> = { square: "0", rounded: "6px", pill: "999px" };
const HEADING: Record<string, { size: number; line: number }> = { 1: { size: 28, line: 34 }, 2: { size: 22, line: 28 }, 3: { size: 17, line: 24 } };

/** Black or white, whichever reads better on the given background. */
export function contrastOn(bg: string): string {
  const n = parseInt(bg.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#FFFFFF";
}
/** A softer version of the text colour for footers and captions. */
export function mute(text: string, bg: string, keep = 0.6): string {
  const a = parseInt(text.slice(1), 16), b = parseInt(bg.slice(1), 16);
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * keep + ((b >> sh) & 255) * (1 - keep));
  return `#${[16, 8, 0].map((sh) => mix(sh).toString(16).padStart(2, "0")).join("")}`;
}

export function normalStyle(s: Partial<EmailStyle> | null | undefined): EmailStyle {
  return {
    bg: hex(s?.bg, DEFAULT_STYLE.bg), surface: hex(s?.surface, DEFAULT_STYLE.surface), text: hex(s?.text, DEFAULT_STYLE.text),
    accent: hex(s?.accent, DEFAULT_STYLE.accent), font: Object.hasOwn(FONT_STACK, s?.font ?? "") ? s!.font! : "sans",
    footerNote: typeof s?.footerNote === "string" ? s.footerNote : DEFAULT_STYLE.footerNote,
  };
}

const FALLBACK: Record<string, string> = { first_name: "there", name: "there", business_name: "your business" };
/** Replaces {{tags}}. Unknown tags are removed. Values are escaped when `html` is set. */
export function mergeTags(s: string, values: Record<string, string>, html = false): string {
  return s.replace(/\{\{\s*([a-z_]{1,30})\s*\}\}/gi, (_m, k: string) => {
    const key = k.toLowerCase();
    const v = (Object.hasOwn(values, key) && values[key]?.trim()) || FALLBACK[key] || "";
    return html ? esc(v) : v;
  });
}

const isWeb = (u: string) => /^https?:\/\//i.test(u);
/** Addresses are stored as typed; only web / mailto / tel links and http(s) pictures ever reach the email. */
const href = (u: string) => (u ? safeHref(u) ?? "" : "");
const imgSrc = (u: string) => (/^https?:\/\/[^\s"<>]+$/i.test((u ?? "").trim()) ? u.trim() : "");

/** Every web link in the newsletter, in order, without duplicates. The send job stores these for click tracking. */
export function collectLinks(blocks: Block[]): string[] {
  const out = new Set<string>();
  const fromRich = (h: string) => { for (const m of sanitizeRich(h).matchAll(/<a href="([^"]*)">/g)) out.add(unesc(m[1]!)); };
  for (const b of blocks) {
    if (b.type === "text") fromRich(b.html);
    else if (b.type === "columns") { fromRich(b.left.html); fromRich(b.right.html); }
    else if (b.type === "image" || b.type === "button") out.add(href(b.href));
    else if (b.type === "social") b.links.forEach((l) => out.add(href(l.url)));
  }
  return [...out].filter(isWeb);
}
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function renderEmail(c: RenderInput, o: RenderOpts): { html: string; text: string; subject: string } {
  const st = normalStyle(c.style);
  const font = FONT_STACK[st.font];
  const soft = mute(st.text, st.surface);
  const footInk = mute(contrastOn(st.bg) === "#FFFFFF" ? "#FFFFFF" : "#111111", st.bg);
  const values = { company: o.companyName, ...o.merge };
  const track = (raw: string) => { const u = href(raw); return u && o.link && isWeb(u) ? o.link(u) : u; };
  const m = (s: string) => mergeTags(s, values, true); // for already-escaped / sanitised HTML
  const t = (s: string) => esc(mergeTags(s, values)); // plain text → HTML

  const rich = (html: string) => m(sanitizeRich(html))
    .replace(/<a href="([^"]*)">/g, (_x, h: string) => `<a href="${esc(track(unesc(h)))}" style="color:${st.accent};text-decoration:underline;">`)
    .replace(/<p>/g, `<p style="margin:0 0 12px;">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 12px;padding:0 0 0 22px;">`)
    .replace(/<li>/g, `<li style="margin:0 0 4px;">`);
  const body = (html: string, align: Align) => `<div style="font-family:${font};font-size:15px;line-height:23px;color:${st.text};text-align:${align};">${rich(html)}</div>`;
  const img = (src: string, alt: string, px: number, pct: number, align: Align, link: string) => {
    const tag = `<img src="${esc(src)}" alt="${t(alt)}" width="${px}" style="display:block;width:${pct}%;max-width:100%;height:auto;border:0;outline:none;${align === "center" ? "margin:0 auto;" : align === "right" ? "margin:0 0 0 auto;" : ""}border-radius:4px;">`;
    const to = track(link);
    return to ? `<a href="${esc(to)}" style="text-decoration:none;">${tag}</a>` : tag;
  };
  const cellHtml = (cl: Cell) => `${imgSrc(cl.imageSrc) ? `<div style="margin:0 0 10px;">${img(imgSrc(cl.imageSrc), cl.imageAlt, 256, 100, "left", "")}</div>` : ""}${body(cl.html, "left")}`;
  const row = (inner: string, pad = "8px 32px") => `<tr><td class="pad" style="padding:${pad};">${inner}</td></tr>`;

  const blockHtml = (b: Block): string => {
    switch (b.type) {
      case "heading": {
        const h = pick(HEADING, String(b.level), HEADING[2]!);
        return row(`<h${b.level} style="margin:0;font-family:${font};font-size:${h.size}px;line-height:${h.line}px;font-weight:700;color:${st.text};text-align:${pick(ALIGN, b.align, "left")};">${t(b.text)}</h${b.level}>`, "10px 32px 6px");
      }
      case "text": return row(body(b.html, pick(ALIGN, b.align, "left")), "6px 32px 0");
      case "image": {
        const src = imgSrc(b.src);
        if (!src) return "";
        const pct = Math.min(100, Math.max(10, Math.round(Number(b.width) || 100)));
        return row(`<div style="text-align:${pick(ALIGN, b.align, "center")};">${img(src, b.alt, Math.round(536 * pct / 100), pct, pick(ALIGN, b.align, "center"), b.href)}</div>`, "10px 32px");
      }
      case "button": {
        if (!b.label.trim()) return "";
        const solid = b.fill !== "outline", r = pick(RADIUS, b.radius, "6px"), full = b.width === "full", al = pick(ALIGN, b.align, "left");
        const ink = solid ? contrastOn(st.accent) : st.accent;
        const a = `<a href="${esc(track(b.href) || "#")}" style="display:${full ? "block" : "inline-block"};padding:12px 24px;font-family:${font};font-size:15px;line-height:20px;font-weight:600;color:${ink};text-decoration:none;text-align:center;border-radius:${r};">${t(b.label)}</a>`;
        return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${full ? `width="100%"` : `align="${al}"`} style="${full ? "width:100%;" : ""}border-collapse:separate;"><tr><td align="center" ${solid ? `bgcolor="${st.accent}"` : ""} style="border-radius:${r};border:2px solid ${st.accent};${solid ? `background:${st.accent};` : ""}">${a}</td></tr></table>`, "12px 32px");
      }
      case "columns":
        return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="col" width="50%" valign="top" style="width:50%;padding:0 12px 0 0;vertical-align:top;">${cellHtml(b.left)}</td>
<td class="col" width="50%" valign="top" style="width:50%;padding:0 0 0 12px;vertical-align:top;">${cellHtml(b.right)}</td>
</tr></table>`, "8px 32px 0");
      case "divider": return row(`<div style="border-top:1px solid ${mute(st.text, st.surface, 0.18)};font-size:0;line-height:0;height:0;">&nbsp;</div>`, "14px 32px");
      case "spacer": { const h = Math.min(120, Math.max(4, Math.round(Number(b.height) || 24))); return `<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`; }
      case "social": {
        const links = b.links.filter((l) => href(l.url));
        if (!links.length) return "";
        return row(`<div style="font-family:${font};font-size:13px;line-height:20px;text-align:${pick(ALIGN, b.align, "center")};">${links.map((l) => `<a href="${esc(track(l.url))}" style="color:${st.accent};text-decoration:underline;font-weight:600;">${esc(pick(SOCIAL_LABEL, l.network, "Link"))}</a>`).join(`<span style="color:${soft};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`)}</div>`, "10px 32px");
      }
    }
  };

  const subject = mergeTags(c.subject, values).replace(/[\r\n]+/g, " ").trim();
  const pre = mergeTags(c.preheader, values);
  const footLink = `color:${footInk};text-decoration:underline;`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(subject)}</title>
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
@media (max-width:620px){.wrap{width:100%!important;}.pad{padding-left:20px!important;padding-right:20px!important;}.col{display:block!important;width:100%!important;padding:0 0 12px!important;}.outer{padding:12px 8px!important;}}
</style></head>
<body style="margin:0;padding:0;background:${st.bg};">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(pre)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${st.bg}" style="background:${st.bg};"><tr><td class="outer" align="center" style="padding:24px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${st.surface}" style="width:600px;max-width:100%;background:${st.surface};border-radius:8px;">
<tr><td style="height:22px;font-size:0;line-height:0;">&nbsp;</td></tr>
${c.blocks.map(blockHtml).join("\n")}
<tr><td style="height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;"><tr><td class="pad" style="padding:18px 32px 8px;font-family:${font};font-size:12px;line-height:18px;color:${footInk};text-align:center;">
${st.footerNote.trim() ? `${t(st.footerNote)}<br>` : ""}${esc(o.companyName)}${o.postalAddress.trim() ? ` · ${esc(o.postalAddress)}` : ""}<br>
<a href="${esc(o.unsubscribeUrl)}" style="${footLink}">Unsubscribe</a>${o.viewUrl ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${esc(o.viewUrl)}" style="${footLink}">View in browser</a>` : ""}
</td></tr></table>
</td></tr></table>
${o.pixelUrl ? `<img src="${esc(o.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">` : ""}
</body></html>`;

  // ── Plain-text alternative ──
  const tx = (s: string) => mergeTags(s, values);
  const lines: string[] = [];
  const cellText = (cl: Cell) => tx(richToText(cl.html));
  for (const b of c.blocks) {
    if (b.type === "heading" && b.text.trim()) lines.push(tx(b.text).toUpperCase());
    else if (b.type === "text") lines.push(tx(richToText(b.html)));
    else if (b.type === "image" && imgSrc(b.src) && (b.alt || href(b.href))) lines.push(`[${tx(b.alt) || "Image"}]${href(b.href) ? ` ${href(b.href)}` : ""}`);
    else if (b.type === "button" && b.label.trim()) lines.push(`${tx(b.label)}: ${href(b.href)}`);
    else if (b.type === "columns") lines.push(cellText(b.left), cellText(b.right));
    else if (b.type === "divider") lines.push("----------------------------------------");
    else if (b.type === "social") lines.push(b.links.filter((l) => href(l.url)).map((l) => `${pick(SOCIAL_LABEL, l.network, "Link")}: ${href(l.url)}`).join("\n"));
  }
  lines.push("--", [st.footerNote.trim() ? tx(st.footerNote) : "", `${o.companyName}${o.postalAddress.trim() ? ` · ${o.postalAddress}` : ""}`, `Unsubscribe: ${o.unsubscribeUrl}`, o.viewUrl ? `View in browser: ${o.viewUrl}` : ""].filter(Boolean).join("\n"));
  return { html, text: lines.filter((l) => l.trim()).join("\n\n"), subject };
}
