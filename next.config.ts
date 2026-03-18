import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow World App to embed the mini app
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
