import { and, eq, inArray, sql } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { db, schema } from "@/db";
import { requirePortalUser } from "@/lib/portal/dal";
import { getRequests } from "@/lib/portal/data";
import { portalLogout } from "../(auth)/actions";
import { DISCLOSURE, Wordmark } from "../ui";
import { MobileMenu, NavLinks } from "./Nav";

export default async function PortalShell({ children }: { children: React.ReactNode }) {
  const u = await requirePortalUser();
  const [[cb], reqs] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.chargebacks)
      .where(and(eq(schema.chargebacks.merchantId, u.merchantId), eq(schema.chargebacks.status, "Processed"), inArray(schema.chargebacks.disputeStatus, ["none"]))),
    getRequests(u),
  ]);
  const counts = { disputes: cb?.n ?? 0, requests: reqs.filter((r) => r.waitingOnYou).length };

  const who = (
    <div className="mp-who">
      <b>{u.dbaName}</b>
      <span>{u.name}</span>
      <form action={portalLogout}>
        <button type="submit"><LogOut className="ic" aria-hidden="true" />Sign out</button>
      </form>
    </div>
  );

  return (
    <div className="mp-shell">
      <a href="#main" className="sr">Skip to content</a>
      <aside className="mp-rail">
        <Wordmark />
        <NavLinks counts={counts} />
        {who}
      </aside>
      <header className="mp-topbar">
        <Wordmark />
        <MobileMenu total={counts.disputes + counts.requests}>
          <NavLinks counts={counts} />
          {who}
        </MobileMenu>
      </header>
      <div className="mp-main">
        <main className="mp-page" id="main">{children}</main>
        <footer className="mp-foot">{DISCLOSURE}</footer>
      </div>
    </div>
  );
}
