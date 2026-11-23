import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  reset: "Your password was updated. Sign in with the new password.",
  signed_out: "You’ve been signed out.",
  sso_error: "Single sign-on didn’t complete. Try again or use your password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const [general, sso] = await Promise.all([getSetting("general"), getSetting("sso")]);
  const notice = Object.keys(NOTICES).find((k) => sp[k]) ;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <AuthShell company={general.companyName}>
      <LoginForm next={next} notice={notice ? NOTICES[notice] : null} ssoLabel={sso.enabled && sso.issuerUrl && sso.clientId ? sso.providerName : null} />
    </AuthShell>
  );
}
