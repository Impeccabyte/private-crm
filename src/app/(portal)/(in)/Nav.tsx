"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Building2, ChartColumn, House, Landmark, MessagesSquare, ShieldAlert, type LucideIcon } from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon; key?: "disputes" | "requests" }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/deposits", label: "Deposits", icon: Landmark },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/disputes", label: "Disputes", icon: ShieldAlert, key: "disputes" },
  { href: "/requests", label: "Requests", icon: MessagesSquare, key: "requests" },
  { href: "/account", label: "Account", icon: Building2 },
];

export function NavLinks({ counts }: { counts: { disputes: number; requests: number } }) {
  const path = usePathname();
  return (
    <nav className="mp-nav" aria-label="Your account">
      {ITEMS.map((it) => {
        const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
        const n = it.key ? counts[it.key] : 0;
        const Icon = it.icon;
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}>
            <Icon className="ic" aria-hidden="true" />
            {it.label}
            {n > 0 && <span className="ct" aria-label={`${n} need you`}>{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone menu: a native disclosure that closes itself when the route changes. */
export function MobileMenu({ total, children }: { total: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [path]);
  return (
    <details ref={ref}>
      <summary aria-label={total ? `Menu, ${total} need you` : "Menu"}>
        Menu {total > 0 && <span className="ct" aria-hidden="true">{total}</span>}
      </summary>
      <div className="mp-drawer">{children}</div>
    </details>
  );
}
