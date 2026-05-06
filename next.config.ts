import type { NextConfig } from "next";

// Capture build timestamp at module-load time. This runs once when Next
// starts the build (or `next dev` boots). The Footer component reads
// NEXT_PUBLIC_BUILD_TIME via process.env.
const BUILD_TIME = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";

const nextConfig: NextConfig = {
  env: {
    BUILD_TIME,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "logo.clearbit.com",
      },
    ],
  },
};

export default nextConfig;
