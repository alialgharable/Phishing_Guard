import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactProductionProfiling: false,
  // Generated artwork ships as static assets; skipping the optimizer keeps this
  // project free of native image dependencies and works from any host.
  images: { unoptimized: true },
  // The dev server is previewed through a proxied host in some environments.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
};

export default nextConfig;
