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
  experimental: {
    // El segment explorer de DevTools inyecta su módulo (SegmentViewNode) en el
    // payload RSC de la app. Con React 19 el cliente recibe un árbol de módulos
    // que no corresponde y falla la hidratación con
    // "invariant expected layout router to be mounted". No aporta nada a este
    // proyecto: el enrutado es interno (state), sin App Router.
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
