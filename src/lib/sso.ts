/** OpenID Connect sign-in (authorization code + PKCE). Configured in Settings → Single sign-on. */
import * as oidc from "openid-client";
import { getSetting, readSecret } from "./settings";

export function appBase() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
export const callbackUrl = () => `${appBase()}/auth/sso/callback`;

export async function ssoConfig() {
  const s = await getSetting("sso");
  if (!s.enabled || !s.issuerUrl || !s.clientId || !s.clientSecretEnc) return null;
  const config = await oidc.discovery(new URL(s.issuerUrl), s.clientId, readSecret(s.clientSecretEnc) ?? undefined);
  return { settings: s, config };
}

export { oidc };
