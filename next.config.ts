import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Allow preview sandbox to write build output to workspace
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['mupdf'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb', // Pour les gros ZIP de CVs
    },
  },
  // pdfjs-dist v5 — exclure canvas optionnel côté serveur
  // turbopack pour le build prod (Vercel), webpack pour le dev local (--webpack flag)
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.js',
    },
  },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false }
    return config
  },
};

export default withSentryConfig(nextConfig, {
  // Upload source maps silencieusement
  silent: true,
  // Organisation et projet Sentry
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source maps : ne pas exposer au client
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
