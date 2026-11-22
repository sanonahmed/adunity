import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /* Telegram loads the Mini App in an iframe on web.telegram.org and in a
     WebView on mobile. `frame-ancestors` is the correct control here —
     X-Frame-Options has no "allow all" value. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
