import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.20.10.3"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
