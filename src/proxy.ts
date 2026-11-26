import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → send to /login. The real session and permission checks
 * happen in the Data Access Layer (src/lib/dal.ts) on every page and server action.
 */
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/api/health", "/api/webhooks", "/auth/", "/f/", "/embed/", "/api/forms/", "/e/"];

/** Merchant portal: its own cookie and its own sign-in. A staff cookie never opens it, and vice versa. */
const PORTAL_PUBLIC = ["/portal/login", "/portal/forgot-password", "/portal/set-password/"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    if (PORTAL_PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
    if (!req.cookies.get("ib_portal")?.value) {
      const url = new URL("/portal/login", req.url);
      if (pathname !== "/portal") url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("ib_session")?.value) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // The public lead-form submit endpoint skips the proxy so file uploads aren’t buffered (and cut off) at 10 MB.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/forms/).*)"],
};
