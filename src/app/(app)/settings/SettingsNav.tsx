"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" style={{ width: 190, display: "flex", flexDirection: "column", gap: 2, flex: "none" }}>
      {items.map((i) => {
        const on = path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={`mi ${on ? "act" : ""}`} aria-current={on ? "page" : undefined}
            style={on ? { color: "var(--accent-ink)", background: "var(--accent-soft)" } : undefined}>{i.label}</Link>
        );
      })}
    </nav>
  );
}
