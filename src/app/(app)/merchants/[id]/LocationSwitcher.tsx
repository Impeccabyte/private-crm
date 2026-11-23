"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";

export function LocationSwitcher({ current, ein, locations }: { current: string; ein: string; locations: { id: string; name: string; sub: string; status: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <span className="rel" ref={ref}>
      <button type="button" className="locsw" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Building2 size={12} aria-hidden="true" />{locations.length} locations<ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <span className="pop" role="menu" style={{ left: 0, right: "auto", width: 340, display: "block" }}>
          <span className="subtle sm" style={{ display: "block", padding: "6px 8px" }}>Same legal entity · EIN <span className="mask">{ein}</span></span>
          {locations.map((l) => (
            <Link key={l.id} role="menuitem" href={`/merchants/${l.id}`} className={`mi ${l.id === current ? "act" : ""}`} style={{ height: "auto", padding: 8 }} onClick={() => setOpen(false)}>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block" }}>{l.name}</span><span className="subtle sm" style={{ display: "block", fontWeight: 400 }}>{l.sub}</span></span>
              <span className="tag">{l.status}</span>
            </Link>
          ))}
        </span>
      )}
    </span>
  );
}
