/**
 * Strict allowlist sanitiser for the rich text typed into newsletter text blocks. No DOM needed, so it runs the
 * same in the browser and on the server. Applied when a newsletter is saved and again when it's rendered.
 *
 * Kept: strong/b, em/i, u, a[href], br, p, ul, ol, li. Everything else is dropped (its text is kept),
 * all attributes are removed except a safe href, and tags are re-balanced.
 */
const ALLOWED = new Set(["strong", "em", "u", "a", "br", "p", "ul", "ol", "li"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", div: "p" };
const VOID = new Set(["br"]);

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s: string) => s.replace(/&(?!(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,30});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** A link is kept only if it's a plain web, mailto or tel address. */
export function safeHref(raw: string): string | null {
  const v = decode(raw).replace(/[\u0000- \u007f]/g, "").trim();
  if (!v) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v.slice(0, 2000);
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // javascript:, data:, vbscript: …
  if (/^[^\s/]+\.[^\s]+$/.test(v)) return `https://${v}`.slice(0, 2000); // "example.com/page"
  return null;
}

export function sanitizeRich(input: string): string {
  let src = String(input ?? "").slice(0, 20_000);
  src = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|title|head)\b[\s\S]*?<\/\1\s*>/gi, "");
  const out: string[] = [];
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let last = 0, m: RegExpExecArray | null;
  const close = (tag: string) => {
    const at = stack.lastIndexOf(tag);
    if (at === -1) return;
    while (stack.length > at) out.push(`</${stack.pop()}>`);
  };
  while ((m = re.exec(src))) {
    out.push(escText(src.slice(last, m.index)));
    last = re.lastIndex;
    const closing = m[1] === "/";
    let tag = m[2]!.toLowerCase();
    tag = RENAME[tag] ?? tag;
    if (!ALLOWED.has(tag)) continue;
    if (closing) { if (!VOID.has(tag)) close(tag); continue; }
    if (VOID.has(tag)) { out.push(`<${tag}>`); continue; }
    if (tag === "a") {
      const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[3] ?? "");
      const href = h ? safeHref(h[1] ?? h[2] ?? h[3] ?? "") : null;
      if (!href) continue; // drop the tag, keep its text
      close("a"); // no nested links
      out.push(`<a href="${escAttr(href)}">`);
      stack.push("a");
      continue;
    }
    if (tag === "p") close("p"); // paragraphs don't nest
    out.push(`<${tag}>`);
    stack.push(tag);
  }
  out.push(escText(src.slice(last)));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("").replace(/<p>\s*<\/p>/g, "").trim();
}

/** Rich text → plain text for the text/plain part of the email. Links become "label (address)". */
export function richToText(html: string): string {
  return decode(
    sanitizeRich(html)
      .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, href: string, label: string) => { const l = label.replace(/<[^>]*>/g, "").trim(); const h = decode(href); return !l || l === h ? h : `${l} (${h})`; })
      .replace(/<li>/g, "• ").replace(/<\/li>/g, "\n").replace(/<br>/g, "\n").replace(/<\/p>/g, "\n\n").replace(/<\/(ul|ol)>/g, "\n")
      .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " "),
  ).replace(/\n{3,}/g, "\n\n").trim();
}
