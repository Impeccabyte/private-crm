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
