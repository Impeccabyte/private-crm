import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → send to the right sign-in. The real session and permission checks
 * happen in the Data Access Layers (src/lib/dal.ts for staff, src/lib/portal/dal.ts for merchants) on every page,
 * route and server action.
 *
 * The app has two halves that never share a session:
 *  - Staff CRM under /ase (cookie ib_session, sign-in at /ase/login).
 *  - Merchant portal at the root (cookie ib_portal, sign-in at /login).
 */
const STAFF_PUBLIC = ["/ase/login", "/ase/forgot-password", "/ase/reset-password/"];
const PORTAL_PUBLIC = ["/login", "/forgot-password", "/set-password/"];

/** Not pages of either half. Each checks its own access (staff session, portal session, token or signature). */
const SELF_CHECKED = ["/api/", "/auth/", "/f/", "/embed/", "/e/"];

const under = (pathname: string, prefix: string) => (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + "/"));

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (SELF_CHECKED.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (under(pathname, "/ase")) {
    if (STAFF_PUBLIC.some((p) => under(pathname, p))) return NextResponse.next();
    if (!req.cookies.get("ib_session")?.value) {
      const url = new URL("/ase/login", req.url);
      if (pathname !== "/ase") url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PORTAL_PUBLIC.some((p) => under(pathname, p))) return NextResponse.next();
  if (!req.cookies.get("ib_portal")?.value) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // The public lead-form submit endpoint skips the proxy so file uploads aren’t buffered (and cut off) at 10 MB.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|api/forms/).*)"],
};
