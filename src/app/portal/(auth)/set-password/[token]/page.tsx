import Link from "next/link";
import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";
import { AuthFrame } from "../../frame";
import { SetPasswordForm } from "../../forms";

export const metadata: Metadata = { title: "Choose your password" };

export default async function PortalSetPassword({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sec = await getSetting("security");
  return (
    <AuthFrame>
      <div>
        <h1>Choose your <em>password</em>.</h1>
        <p className="muted" style={{ marginTop: 8 }}>You&apos;ll use it with your email to sign in.</p>
      </div>
      <SetPasswordForm token={token} min={sec.passwordMinLength} />
      <p className="sm"><Link href="/portal/forgot-password">Link expired? Get a new one</Link></p>
    </AuthFrame>
  );
}
