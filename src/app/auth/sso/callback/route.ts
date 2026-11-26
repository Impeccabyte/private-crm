import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { appBase, callbackUrl, oidc, ssoConfig } from "@/lib/sso";
import { createSession, requestIp } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

const fail = (reason: string) => {
  console.warn("[sso] callback rejected:", reason);
  return Response.redirect(`${appBase()}/ase/login?sso_error=1`, 302);
};

export async function GET(req: Request) {
  const jar = await cookies();
  const raw = jar.get("ib_sso")?.value;
  jar.delete({ name: "ib_sso", path: "/auth/sso" });
  if (!raw) return fail("missing state cookie");
  let st: { verifier: string; state: string; nonce: string; next: string };
  try { st = JSON.parse(decrypt(raw)); } catch { return fail("bad state cookie"); }
  try {
    const sso = await ssoConfig();
    if (!sso) return fail("SSO disabled");
    const incoming = new URL(req.url);
    const current = new URL(callbackUrl());
    current.search = incoming.search;
    const tokens = await oidc.authorizationCodeGrant(sso.config, current, { pkceCodeVerifier: st.verifier, expectedState: st.state, expectedNonce: st.nonce, idTokenExpected: true });
    const claims = tokens.claims();
    const email = String(claims?.email ?? "").toLowerCase();
    if (!email || claims?.email_verified === false) return fail("no verified email in ID token");
    const domains = sso.settings.allowedDomains.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    const domainOk = !domains.length || domains.includes(email.split("@")[1]!);
    let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user) {
      if (!sso.settings.autoProvision || !domains.length || !domainOk) return fail(`no CRM user for ${email}`);
      [user] = await db.insert(schema.users).values({ email, name: String(claims?.name ?? email.split("@")[0]), role: sso.settings.defaultRole, status: "active" }).returning();
      await audit({ id: user!.id, email }, "user.auto_provisioned", "user", user!.id);
    }
    if (!domainOk && user!.role !== "admin") return fail(`domain not allowed for ${email}`);
    if (user!.status !== "active") return fail(`user ${email} is ${user!.status}`);
    const sec = await getSetting("security");
    await db.update(schema.users).set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(schema.users.id, user!.id));
    await createSession(user!.id, sec.sessionHours * 3_600_000, false);
    await audit({ id: user!.id, email, ip: await requestIp() }, "auth.login_sso", "user", user!.id, { provider: sso.settings.providerName });
    const next = st.next && (st.next === "/ase" || st.next.startsWith("/ase/")) ? st.next : "/ase";
    return Response.redirect(`${appBase()}${next}`, 302);
  } catch (err) {
    return fail((err as Error).message);
  }
}
