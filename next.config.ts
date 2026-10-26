import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lint runs as its own gate (`pnpm lint`); keeping it out of the build avoids
  // duplicated output and the deprecated build-time linting path.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // En dev el server escucha en 0.0.0.0 y se entra por localhost/127.0.0.1 o por
  // la IP de la LAN: Next 15 avisa si el origen no está listado.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
