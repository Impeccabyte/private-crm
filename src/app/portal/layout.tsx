import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import "./portal.css";

const newsreader = Newsreader({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-newsreader", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-hanken", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Your account · Impeccabyte", template: "%s · Impeccabyte" },
  description: "Your Impeccabyte merchant account: deposits, sales, disputes and requests.",
  robots: { index: false, follow: false },
};

export default function PortalRoot({ children }: { children: React.ReactNode }) {
  return <div className={`mp ${newsreader.variable} ${hanken.variable} ${mono.variable}`}>{children}</div>;
}
