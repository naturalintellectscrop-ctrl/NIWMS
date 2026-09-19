import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  reactStrictMode: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      ],
    }]
  },
};

export default nextConfig;
// Build version 2.1.1
