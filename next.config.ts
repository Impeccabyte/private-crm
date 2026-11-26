import type { NextConfig } from "next";

// Every screen in the CRM is per-user and request-time, so Cache Components is off
// (see node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md).
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["pg-boss", "postgres", "bcryptjs", "nodemailer"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Old addresses, from before the merchant portal moved to the root and the staff CRM moved under /ase
    // (Nov 2026). Sent emails and bookmarks still use them. The old staff /login, /account, /reports and
    // /forgot-password can't be redirected: those addresses are merchant pages now.
    const staff = ["merchants", "leads", "deals", "applications", "chargebacks", "residuals", "settings", "support", "email"];
    return [
      { source: "/portal", destination: "/", permanent: false },
      { source: "/portal/:path*", destination: "/:path*", permanent: false },
      { source: "/reset-password/:token", destination: "/ase/reset-password/:token", permanent: false },
      ...staff.flatMap((s) => [
        { source: `/${s}`, destination: `/ase/${s}`, permanent: false },
        { source: `/${s}/:path*`, destination: `/ase/${s}/:path*`, permanent: false },
      ]),
    ];
  },
  async headers() {
    return [
      {
        // Everything except the public lead form pages (/f/…), which set their own frame-ancestors CSP.
        source: "/((?!f/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
