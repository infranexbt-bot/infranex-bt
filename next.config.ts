import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // WINDUP-1: ssh2 (SSH transport for the installer/doctor) ships CJS
  // dynamic requires that Turbopack cannot place in ESM chunks — keep it as
  // a runtime require instead of bundling it.
  serverExternalPackages: ["ssh2", "sshpk"],
  typescript: {
    // WINDUP-1: tsc is back to 0 errors, so builds now GATE on types.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // PREVIEW-FRAME-1: X-Frame-Options: DENY blocked the Z.ai preview
          // iframe ("refused to connect"). CSP frame-ancestors is the modern
          // selective-allow replacement: still blocks third-party framing,
          // but lets the platform's own preview/chat surfaces embed the app.
          // Modern browsers ignore X-Frame-Options when frame-ancestors is
          // present, so do NOT reintroduce the blanket DENY.
          //
          // AUDIT-3 (L-5) — full CSP. The app is fully same-origin: Next
          // self-hosts fonts, no external images/CDNs. 'unsafe-inline' is
          // required for script-src (the two inline bootstrap scripts in
          // app/layout.tsx) and style-src (React inline styles). object-src
          // 'none' + base-uri 'self' + form-action 'self' close the classic
          // injection prisms. If a new external origin is added (CDN, image
          // host), extend the relevant directive here — do NOT loosen to *.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self' https://*.space-z.ai https://*.z.ai",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // AUDIT-3 (L-5) — HSTS; only meaningful over TLS (preview/prod),
          // ignored over plain HTTP locally.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
