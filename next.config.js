/** @type {import('next').NextConfig} */
const apiHost = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://api:8000";

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Backend proxying lives in app/api/[...proxy]/route.ts (explicit hop with
  // error surfacing). Only the NextAuth-owned subtree stays local here.
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: "/api/auth/:path*",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/auth/login",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
