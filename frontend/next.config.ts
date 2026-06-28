import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";

    return [
      {
        source: "/analytics/:path*",
        destination: `${backendUrl}/analytics/:path*`,
      },
    ];
  },
};

export default nextConfig;
