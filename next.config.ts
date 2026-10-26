import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lint runs as its own gate (`pnpm lint`); keeping it out of the build avoids
  // duplicated output and the deprecated build-time linting path.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
