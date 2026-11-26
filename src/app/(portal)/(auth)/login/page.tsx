import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/dal";
import { AuthFrame } from "../frame";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function PortalLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getPortalUser()) redirect("/");
  const sp = await searchParams;
  return (
    <AuthFrame>
      <div>
        <h1>Welcome <em>back</em>.</h1>
        <p className="muted" style={{ marginTop: 8 }}>Sign in to see your deposits, disputes and requests.</p>
      </div>
      {sp.set && <p className="mp-callout ok" role="status">Your password is saved. Sign in with it now.</p>}
      {sp.signed_out && <p className="mp-callout" role="status">You&apos;re signed out.</p>}
      <LoginForm next={sp.next} />
      <p className="sm muted">
        <Link href="/forgot-password">Forgot your password?</Link>
        <br />No account yet? Your account manager sends the invite once your merchant account is set up.
      </p>
    </AuthFrame>
  );
}
