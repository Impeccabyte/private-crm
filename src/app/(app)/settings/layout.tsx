import { requirePage } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { SettingsNav } from "./SettingsNav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("settings.manage");
  const items = [
    { href: "/settings/general", label: "General" },
    { href: "/settings/security", label: "Security" },
    { href: "/settings/email", label: "Email" },
    { href: "/settings/sso", label: "Single sign-on" },
    can(user.role, "users.manage") && { href: "/settings/users", label: "Users & roles" },
    can(user.role, "integrations.manage") && { href: "/settings/integrations", label: "Integrations" },
    can(user.role, "audit.view") && { href: "/settings/audit", label: "Audit log" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="content">
      <div className="ph"><div><h1>Settings</h1><div className="sub">Workspace configuration · changes apply immediately</div></div></div>
      <div className="settings-shell" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <SettingsNav items={items} />
        <div className="stack" style={{ flex: "999 1 640px", minWidth: 0, gap: 20 }}>{children}</div>
      </div>
    </div>
  );
}
