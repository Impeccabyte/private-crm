import { Emblem } from "@/components/Emblem";
import type { ReactNode } from "react";
import { RefreshCw, Users, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthShell({ children, company }: { children: ReactNode; company: string }) {
  return (
    <div className="lg">
      <main className="lg-form">
        <div className="lg-top">
          <Emblem className="logo" />
          <span style={{ fontWeight: 600 }}>{company} CRM</span>
          <span className="sp" />
          <ThemeToggle />
        </div>
        <div className="lg-mid"><div className="lg-card">{children}</div></div>
        <footer className="lg-foot">
          <span>© {new Date().getFullYear()} {company}</span>
          <span className="sp" />
          <span>Internal system · authorized users only</span>
        </footer>
      </main>
      <aside className="lg-side" aria-label={`About ${company} CRM`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 440, margin: "auto 0" }}>
          <h2 style={{ margin: 0, fontSize: 26, lineHeight: "34px", fontWeight: 600, letterSpacing: "-.02em" }}>Merchants, boarding, support and residuals, in one place.</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {[
              [RefreshCw, "Synced with Maverick", "Applications, chargebacks and payouts update on their own."],
              [Users, "Built around your role", "Agents see their own book. Managers see the whole portfolio."],
              [ShieldCheck, "Sensitive data stays masked", "EINs and bank accounts are hidden by default, and every reveal is logged."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof RefreshCw;
              return (
                <div className="lg-feat" key={t as string}>
                  <span className="fi"><I size={16} aria-hidden="true" /></span>
                  <div><div style={{ fontWeight: 600 }}>{t as string}</div><div className="muted2 sm" style={{ marginTop: 2 }}>{d as string}</div></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="muted2 sm">Need help signing in? Ask your manager or an admin.</div>
      </aside>
    </div>
  );
}
