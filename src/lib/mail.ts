import nodemailer from "nodemailer";
import { getSetting, readSecret as readSetting } from "./settings";

/** Sends system email using the SMTP settings stored in Settings → Email (Mailpit in local Docker). */
export async function sendMail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getSetting("email");
  if (!s.enabled) return { ok: false, error: "Email sending is turned off in Settings → Email." };
  try {
    const transport = nodemailer.createTransport({
      host: s.host, port: s.port, secure: s.secure,
      auth: s.username ? { user: s.username, pass: readSetting(s.passwordEnc) ?? "" } : undefined,
    });
    await transport.sendMail({ from: `"${s.fromName}" <${s.fromAddress}>`, to, subject, text });
    return { ok: true };
  } catch (err) {
    console.error("[mail] send failed", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }
}
