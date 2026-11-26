import "server-only";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { randomToken, sha256 } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";

const base = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const portalUrl = (path = "") => `${base()}${path}`;

/** Single-use link for a merchant to set (invite) or reset their portal password. */
export async function issuePortalLink(portalUserId: string, email: string, name: string, dbaName: string, purpose: "reset" | "invite") {
  const sec = await getSetting("security");
  const token = randomToken(32);
  const ttl = purpose === "invite" ? sec.inviteTokenHours * 3_600_000 : sec.resetTokenMinutes * 60_000;
  await db.insert(schema.portalPasswordTokens).values({ id: sha256(token), portalUserId, purpose, expiresAt: new Date(Date.now() + ttl) });
  const link = portalUrl(`/set-password/${token}`);
  const first = name.split(/\s+/)[0] ?? name;
  const text = purpose === "invite"
    ? `Hi ${first},\n\nYour Impeccabyte account for ${dbaName} is ready. You can see your deposits, sales and disputes, and send us requests, any time.\n\nChoose your password here (this link works for ${sec.inviteTokenHours} hours):\n${link}\n\nQuestions? Reply to this email.\n\nImpeccabyte`
    : `Hi ${first},\n\nSomeone asked to reset the password for your Impeccabyte account (${email}).\n\nChoose a new password here (this link works for ${sec.resetTokenMinutes} minutes):\n${link}\n\nIf this wasn't you, you can ignore this email.\n\nImpeccabyte`;
  return sendMail(email, purpose === "invite" ? "Your Impeccabyte account is ready" : "Reset your Impeccabyte password", text);
}
