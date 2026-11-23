import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getSetting } from "@/lib/settings";
import "./globals.css";

// Every page is per-user and request-time (Cache Components is off in next.config.ts).
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Impeccabyte CRM", template: "%s · Impeccabyte CRM" },
  description: "Internal CRM for Impeccabyte staff and agents.",
  robots: { index: false, follow: false },
};

// Applies the saved theme before first paint so there is no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('ib-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}`;

const HEX = /^#[0-9a-fA-F]{6}$/;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let accent = "#5B5BD6";
  try {
    const g = await getSetting("general");
    if (HEX.test(g.accentColor)) accent = g.accentColor;
  } catch {
    /* database unavailable: fall back to the default accent */
  }
  return (
    <html lang="en" className={`ib ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style>{`:root,.ib{--accent:${accent}}body,.ib{font-family:var(--font-inter),Inter,ui-sans-serif,system-ui,sans-serif}`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
