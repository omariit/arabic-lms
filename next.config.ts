import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    // HSTS only where the site is actually served over HTTPS: staging and production
    // both run behind Railway's TLS, but local dev must never set it (it would pin
    // localhost to HTTPS in the developer's browser). No `preload` — this domain
    // is not in the HSTS preload list and shouldn't be submitted to it casually.
    const tls = process.env.NODE_ENV === "production";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          ...(tls ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // The sign-in page must never be served from a cache: a stale bundle is
        // exactly what made "/login does not work" happen on a phone.
        source: "/login",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/register",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }
  }
};

export default nextConfig;
