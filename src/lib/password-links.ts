import { db, schema } from "@/db";
import { getSetting } from "./settings";
import { randomToken, sha256 } from "./crypto";
import { sendMail } from "./mail";

/** Creates a single-use token and emails a link. Used by password reset and by invites. */
export async function issuePasswordLink(userId: string, email: string, purpose: "reset" | "invite") {
  const sec = await getSetting("security");
  const token = randomToken(32);
  const ttl = purpose === "invite" ? sec.inviteTokenHours * 3_600_000 : sec.resetTokenMinutes * 60_000;
  await db.insert(schema.passwordTokens).values({ id: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + ttl) });
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/ase/reset-password/${token}`;
  const general = await getSetting("general");
  const text = purpose === "invite"
    ? `You've been invited to ${general.companyName} CRM.\n\nChoose your password here (link expires in ${sec.inviteTokenHours} hours):\n${link}\n`
    : `Someone asked to reset the password for ${email}.\n\nChoose a new password here (link expires in ${sec.resetTokenMinutes} minutes):\n${link}\n\nIf this wasn't you, ignore this email.`;
  return sendMail(email, purpose === "invite" ? `You're invited to ${general.companyName} CRM` : "Reset your Impeccabyte CRM password", text);
}

