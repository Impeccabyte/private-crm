import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { AuthShell } from "../../AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Choose a password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [general, sec] = await Promise.all([getSetting("general"), getSetting("security")]);
  const row = await db.query.passwordTokens.findFirst({
    where: and(eq(schema.passwordTokens.id, sha256(token)), isNull(schema.passwordTokens.usedAt), gt(schema.passwordTokens.expiresAt, new Date())),
  });
  const user = row ? await db.query.users.findFirst({ where: eq(schema.users.id, row.userId), columns: { email: true, name: true } }) : null;
  return (
    <AuthShell company={general.companyName}>
      {row && user ? (
        <ResetForm token={token} email={user.email} invite={row.purpose === "invite"} minLength={sec.passwordMinLength} />
      ) : (
        <>
          <div><h1>This link has expired</h1><p className="lede">Password links work once and expire after a short time. Request a new one.</p></div>
          <div className="row"><Link className="btn pri" href="/ase/forgot-password">Request a new link</Link><Link className="btn ghost" href="/ase/login">Back to sign in</Link></div>
        </>
      )}
    </AuthShell>
  );
}
