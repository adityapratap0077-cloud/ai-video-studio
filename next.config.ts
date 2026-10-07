import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server in .next/standalone for Docker deploys.
  output: "standalone",
};

export default nextConfig;
