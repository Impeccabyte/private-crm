"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("ib-theme", next ? "dark" : "light"); } catch { /* storage blocked */ }
  };
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="btn ghost icon" onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
