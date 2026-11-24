import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → send to /login. The real session and permission checks
 * happen in the Data Access Layer (src/lib/dal.ts) on every page and server action.
 */
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/api/health", "/api/webhooks", "/auth/", "/f/", "/embed/", "/api/forms/", "/e/"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
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
