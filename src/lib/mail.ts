import nodemailer, { type Transporter } from "nodemailer";
import { getSetting, readSecret as readSetting, type EmailSettings } from "./settings";

export type MailResult = {
  ok: boolean;
  error?: string;
  /** "rejected": the server refused this address or message for good. "transient": couldn't reach or log in to the server; nothing was sent. */
  kind?: "rejected" | "transient" | "unknown";
};

export type RichMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Overrides the From name for this message; the From address always comes from Settings → Email. */
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

const options = (s: EmailSettings) => ({
  host: s.host, port: s.port, secure: s.secure,
  auth: s.username ? { user: s.username, pass: readSetting(s.passwordEnc) ?? "" } : undefined,
});

// One pooled connection for bulk sends, rebuilt whenever the SMTP settings change.
let pooled: { key: string; transport: Transporter } | null = null;
function pooledTransport(s: EmailSettings): Transporter {
  const key = [s.host, s.port, s.secure, s.username, s.passwordEnc].join("|");
  if (pooled?.key !== key) {
    pooled?.transport.close();
    pooled = { key, transport: nodemailer.createTransport({ ...options(s), pool: true, maxConnections: 2, maxMessages: 100 }) };
  }
  return pooled.transport;
}

const quoteName = (n: string) => `"${n.replace(/["\\\r\n]/g, "")}"`;

function classify(err: unknown): MailResult["kind"] {
  const e = err as { responseCode?: number; code?: string };
  if (e.responseCode && e.responseCode >= 500) return "rejected";
  if (e.code === "EENVELOPE") return "rejected";
  if (["ECONNECTION", "ECONNREFUSED", "EDNS", "ENOTFOUND", "EAUTH", "EHOSTUNREACH"].includes(e.code ?? "")) return "transient";
  if (e.responseCode && e.responseCode >= 400) return "transient";
  return "unknown";
}

/** Sends one message with optional HTML, reply-to and headers. `pool` reuses a connection (used by newsletter sends). */
export async function sendMailRich(m: RichMail, opts: { pool?: boolean } = {}): Promise<MailResult> {
  const s = await getSetting("email");
  if (!s.enabled) return { ok: false, error: "Email sending is turned off in Settings → Email.", kind: "transient" };
  try {
    const transport = opts.pool ? pooledTransport(s) : nodemailer.createTransport(options(s));
    await transport.sendMail({
      from: `${quoteName(m.fromName || s.fromName)} <${s.fromAddress}>`,
      to: m.to, subject: m.subject, text: m.text, html: m.html,
      replyTo: m.replyTo || s.replyTo || undefined,
      headers: m.headers,
    });
    return { ok: true };
  } catch (err) {
    console.error("[mail] send failed", (err as Error).message);
    return { ok: false, error: (err as Error).message, kind: classify(err) };
  }
}

/** Sends plain-text system email using the SMTP settings stored in Settings → Email (Mailpit in local Docker). */
export async function sendMail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const r = await sendMailRich({ to, subject, text });
  return { ok: r.ok, error: r.error };
}

/**
 * Reasons a newsletter can't be sent with the current mail settings (empty = ready).
 * Guards against sending real mail from an install that still has its out-of-the-box defaults.
 */
export function newsletterMailProblems(s: EmailSettings): string[] {
  const p: string[] = [];
  if (!s.enabled) p.push("Email sending is turned off in Settings → Email.");
  if (s.host === "localhost" || s.host === "127.0.0.1") p.push("Set your mail server in Settings → Email (it still points at “localhost”).");
  if (/@impeccabyte\.example$/i.test(s.fromAddress)) p.push("Set a real From address in Settings → Email.");
  if (!s.postalAddress.trim()) p.push("Add your postal address in Settings → Email. It’s required in the footer of every newsletter.");
  return p;
}
