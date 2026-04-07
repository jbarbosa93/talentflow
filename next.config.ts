import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow preview sandbox to write build output to workspace
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['mupdf'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb', // Pour les gros ZIP de CVs
    },
  },
  // pdfjs-dist v5 — exclure canvas optionnel côté serveur (webpack)
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false }
    return config
  },
};

export default nextConfig;
