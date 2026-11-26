import Link from "next/link";
import type { Metadata } from "next";
import { AuthFrame } from "../frame";
import { ForgotForm } from "../forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function PortalForgot() {
  return (
    <AuthFrame>
      <div>
        <h1>Reset your <em>password</em>.</h1>
        <p className="muted" style={{ marginTop: 8 }}>Enter the email you sign in with and we&apos;ll send a link to choose a new one.</p>
      </div>
      <ForgotForm />
      <p className="sm"><Link href="/portal/login">Back to sign in</Link></p>
    </AuthFrame>
  );
}
