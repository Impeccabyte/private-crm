import nodemailer, { type Transporter } from "nodemailer";
import { getSetting, readSecret as readSetting, type EmailSettings } from "./settings";

export type MailResult = {
  ok: boolean;
  error?: string;
  /**
   * Why it failed, which decides what a bulk send does next:
   * - "recipient": the server refused this address for good (no such mailbox). Don't email it again.
   * - "recipient_temp": refused this address for now (mailbox full, greylisted) or the address is malformed.
   * - "server": couldn't connect or log in, or the server refused the sender. Nothing was sent; affects everyone, so retry later.
   * - "unknown": failed during or after handing over the message. It may have gone out, so never retry automatically.
   */
  kind?: "recipient" | "recipient_temp" | "server" | "unknown";
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

// A refusal at the recipient step that is really about us (relaying, authentication, reputation), not about the address.
const ABOUT_SENDER = /relay|5\.7\.\d|authenticat|sender|spf|dkim|dmarc|policy|blocked|blacklist|denied|not permitted|not allowed|reputation/i;
const BEFORE_DATA = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH\b.*|MAIL FROM)$/;
const NO_CONNECTION = ["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "EDNS", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "ESOCKET", "ETLS", "EAUTH"];

/** nodemailer sets `command` to the SMTP step that failed ("RCPT TO", "MAIL FROM", "CONN", "DATA"…) and `responseCode` to the server's reply. */
export function classifyMailError(err: unknown): NonNullable<MailResult["kind"]> {
  const e = err as { responseCode?: number; code?: string; command?: string; response?: string; message?: string };
  const cmd = (e.command ?? "").toUpperCase(), rc = e.responseCode ?? 0;
  if (cmd === "RCPT TO") {
    if (ABOUT_SENDER.test(`${e.response ?? ""} ${e.message ?? ""}`)) return "server";
    return rc >= 500 ? "recipient" : "recipient_temp";
  }
  if (e.code === "EENVELOPE" && cmd === "API") return "recipient_temp"; // malformed address, caught before connecting
  if (BEFORE_DATA.test(cmd)) return "server";
  if (!cmd && NO_CONNECTION.includes(e.code ?? "")) return "server";
  if (rc >= 400 && rc < 500) return "server"; // "try again later": the message was not accepted
  return "unknown";
}

/** Sends one message with optional HTML, reply-to and headers. `pool` reuses a connection (used by newsletter sends). */
export async function sendMailRich(m: RichMail, opts: { pool?: boolean } = {}): Promise<MailResult> {
  const s = await getSetting("email");
  if (!s.enabled) return { ok: false, error: "Email sending is turned off in Settings → Email.", kind: "server" };
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
    return { ok: false, error: (err as Error).message, kind: classifyMailError(err) };
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
