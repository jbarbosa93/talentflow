import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow preview sandbox to write build output to workspace
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb', // Pour les gros ZIP de CVs
    },
  },
};

export default nextConfig;
