import { and, count, desc, eq, inArray, isNotNull, ne, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, scopeOwnerIds } from "@/lib/dal";
import { can, ROLE_LABEL } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { ConfirmHost } from "@/components/confirm";
import { Sidebar, type NavItem } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const owners = await scopeOwnerIds(user);
  const general = await getSetting("general");

  const merchantScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const [apps, tix, cbs, conns] = await Promise.all([
    db.select({ n: count() }).from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id))
      .where(and(inArray(schema.applications.status, ["New", "Pending", "Underwriting"]), merchantScope)),
    db.select({ n: count() }).from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id))
      .where(and(ne(schema.tickets.status, "Closed"), merchantScope)),
    db.select({ n: count() }).from(schema.chargebacks).leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id))
      .where(and(eq(schema.chargebacks.status, "Processed"), merchantScope)),
    db.select().from(schema.processorConnections).where(eq(schema.processorConnections.enabled, true)),
  ]);

  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: "home" },
    can(user.role, "leads.view") && { href: "/leads", label: "Leads", icon: "leads" },
    can(user.role, "campaigns.manage") && { href: "/email", label: "Email", icon: "email" },
    can(user.role, "deals.view") && { href: "/deals", label: "Deals", icon: "deals" },
    can(user.role, "merchants.view") && { href: "/merchants", label: "Merchants", icon: "merchants" },
    can(user.role, "applications.view") && { href: "/applications", label: "Applications", icon: "applications", count: apps[0]?.n },
    can(user.role, "tickets.view") && { href: "/support", label: "Support", icon: "support", count: tix[0]?.n },
    can(user.role, "chargebacks.view") && { href: "/chargebacks", label: "Chargebacks", icon: "chargebacks", count: cbs[0]?.n },
    can(user.role, "reports.view") && { href: "/reports", label: "Reports", icon: "reports" },
    can(user.role, "residuals.view") && { href: "/residuals", label: "Residuals", icon: "residuals" },
    can(user.role, "settings.manage") && { href: "/settings", label: "Settings", icon: "settings" },
  ].filter(Boolean) as NavItem[];

  const lastSync = conns.map((c) => c.lastSyncAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const syncFailed = conns.some((c) => c.lastSyncStatus === "failed");

  // Notifications: latest processor events in this user's scope.
  const notes = await db.select({ id: schema.activities.id, title: schema.activities.title, at: schema.activities.occurredAt, merchantId: schema.activities.merchantId, dba: schema.merchants.dbaName })
    .from(schema.activities).leftJoin(schema.merchants, eq(schema.activities.merchantId, schema.merchants.id))
    .where(and(eq(schema.activities.source, "maverick"), isNotNull(schema.activities.merchantId), merchantScope))
    .orderBy(desc(schema.activities.occurredAt)).limit(8);
  void dsql;

  return (
    <div className="app">
      <Sidebar items={nav} company={general.companyName} lastSync={lastSync?.toISOString() ?? null} syncFailed={syncFailed} hasConnections={conns.length > 0} />
      <main className="main" id="main">
        <Topbar
          user={{ name: user.name, email: user.email, initials: user.initials, avatarColor: user.avatarColor, roleLabel: ROLE_LABEL[user.role] }}
          canCreate={{ lead: can(user.role, "leads.edit"), ticket: can(user.role, "tickets.edit"), merchant: can(user.role, "merchants.edit") }}
          notifications={notes.map((n) => ({ id: n.id, title: n.title, sub: n.dba ?? "", at: n.at.toISOString(), href: n.merchantId ? `/merchants/${n.merchantId}?tab=activity` : "/" }))}
        />
        {children}
      </main>
      <ConfirmHost />
    </div>
  );
}
