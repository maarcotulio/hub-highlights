import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server and only the traced
  // subset of node_modules, which is what docker/Dockerfile ships. Harmless on
  // Vercel, which ignores it and uses its own build output.
  output: "standalone",
};

export default nextConfig;
