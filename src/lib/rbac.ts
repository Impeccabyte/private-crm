/**
 * Role-based access control. Roles come from the session, never from the client.
 * Record scoping (an agent sees only their own book plus their sub-agents') is applied in the query layer
 * via `scopeOwnerIds()` — see src/lib/dal.ts.
 */
export type Role = "admin" | "manager" | "agent" | "onboarding" | "support";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Sales Agent",
  onboarding: "Onboarding Specialist",
  support: "Support Rep",
};

export const PERMISSIONS = [
  "leads.view", "leads.edit", "leadforms.manage", "campaigns.manage",
  "deals.view", "deals.edit",
  "merchants.view", "merchants.edit", "merchants.hide",
  "applications.view", "applications.edit",
  "tickets.view", "tickets.edit",
  "chargebacks.view", "chargebacks.edit",
  "reports.view",
  "residuals.view",
  "sensitive.reveal",
  "export",
  "settings.manage",
  "users.manage",
  "integrations.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const MATRIX: Record<Role, Set<Permission>> = {
  admin: ALL,
  manager: new Set(PERMISSIONS.filter((p) => p !== "integrations.manage")),
  agent: new Set<Permission>(["leads.view", "leads.edit", "deals.view", "deals.edit", "merchants.view", "merchants.edit",
    "applications.view", "tickets.view", "chargebacks.view", "reports.view", "residuals.view", "export"]),
  onboarding: new Set<Permission>(["merchants.view", "merchants.edit", "merchants.hide", "applications.view", "applications.edit",
    "tickets.view", "tickets.edit", "reports.view", "sensitive.reveal", "export"]),
  support: new Set<Permission>(["merchants.view", "tickets.view", "tickets.edit", "chargebacks.view", "chargebacks.edit",
    "applications.view", "reports.view", "export"]),
};

export function can(role: Role, perm: Permission): boolean {
  return MATRIX[role]?.has(perm) ?? false;
}

/** Roles whose record visibility is limited to their own book. */
export const isScoped = (role: Role) => role === "agent";

export const PERMISSION_LABEL: Record<Permission, string> = {
  "leads.view": "View leads", "leads.edit": "Create & edit leads", "leadforms.manage": "Build & publish lead forms", "campaigns.manage": "Build & send email newsletters",
  "deals.view": "View deals", "deals.edit": "Move & edit deals",
  "merchants.view": "View merchants", "merchants.edit": "Edit merchants, log activity", "merchants.hide": "Hide inactive boarding merchants",
  "applications.view": "View applications", "applications.edit": "Work boarding applications",
  "tickets.view": "View tickets", "tickets.edit": "Reply to & manage tickets",
  "chargebacks.view": "View chargebacks", "chargebacks.edit": "Accept & dispute chargebacks",
  "reports.view": "View reports", "residuals.view": "View residuals",
  "sensitive.reveal": "Reveal EINs and bank numbers (logged)", "export": "Export CSV",
  "settings.manage": "Manage workspace settings", "users.manage": "Invite & manage users",
  "integrations.manage": "Manage processor integrations & secrets", "audit.view": "View audit log",
};

export function matrix(): { perm: Permission; roles: Record<Role, boolean> }[] {
  const roles: Role[] = ["admin", "manager", "agent", "onboarding", "support"];
  return PERMISSIONS.map((perm) => ({ perm, roles: Object.fromEntries(roles.map((r) => [r, can(r, perm)])) as Record<Role, boolean> }));
}
