import { cookies } from "next/headers";
import { encrypt } from "@/lib/crypto";
import { appBase, callbackUrl, oidc, ssoConfig } from "@/lib/sso";

export async function GET(req: Request) {
  try {
    const sso = await ssoConfig();
    if (!sso) return Response.redirect(`${appBase()}/ase/login`, 302);
    const next = new URL(req.url).searchParams.get("next") ?? "/ase";
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    (await cookies()).set("ib_sso", encrypt(JSON.stringify({ verifier, state, nonce, next })), {
      httpOnly: true, sameSite: "lax", secure: appBase().startsWith("https://"), path: "/auth/sso", maxAge: 600,
    });
    const url = oidc.buildAuthorizationUrl(sso.config, {
      redirect_uri: callbackUrl(), scope: "openid email profile", state, nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256",
    });
    return Response.redirect(url.href, 302);
  } catch (err) {
    console.error("[sso] start failed", (err as Error).message);
    return Response.redirect(`${appBase()}/ase/login?sso_error=1`, 302);
  }
}
