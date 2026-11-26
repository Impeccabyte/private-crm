"use client";
import { useId } from "react";

/**
 * The Impeccabyte emblem: a card with three bytes rising from it.
 * "color" is for light and neutral grounds (clay card, bytes rising into amber).
 * "cream" is the dark-ground version, for the clove panels in the merchant portal.
 */
export function Emblem({ tone = "color", className }: { tone?: "color" | "cream"; className?: string }) {
  const id = useId();
  const cream = tone === "cream";
  return (
    <svg className={className} viewBox="14 20 72 72" aria-hidden="true" focusable="false">
      {!cream && (
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#c0623e" />
            <stop offset="0.55" stopColor="#d17c56" />
            <stop offset="1" stopColor="#e0a04d" />
          </linearGradient>
        </defs>
      )}
      <rect x="16" y="60" width="68" height="30" rx="7" fill={cream ? "#faf6ef" : "#c0623e"} />
      <rect x="25" y="68" width="13" height="9" rx="2.5" fill={cream ? "#302419" : "#2a211a"} opacity={cream ? 0.17 : 0.2} />
      <g fill={cream ? "#faf6ef" : `url(#${id})`}>
        <rect x="28" y="46" width="11" height="11" rx="3.4" />
        <rect x="43" y="34" width="11" height="11" rx="3.4" />
        <rect x="58" y="22" width="11" height="11" rx="3.4" />
      </g>
    </svg>
  );
}
