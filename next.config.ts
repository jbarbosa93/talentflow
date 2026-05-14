import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

// v2.2.0 Phase 2 — Force webpack et turbopack à résoudre UNE SEULE version
// de pdfjs-dist (celle du top-level, pinned via package.json), sinon
// `react-pdf@10` charge sa copie nested (5.4.296) et coexiste avec celle
// du top-level (5.5.207) → conflit d'init "Object.defineProperty called on non-object".
const PDFJS_DIST_PATH = path.resolve(__dirname, 'node_modules/pdfjs-dist')

const nextConfig: NextConfig = {
  // Allow preview sandbox to write build output to workspace
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['mupdf'],
  // v2.2.0 Phase 2 — Force Next à transpiler ces modules ESM via swc.
  // Sans ça, webpack dev (`next dev --webpack`) interprète mal les exports
  // de `pdfjs-dist v5` chargé via `react-pdf` → "Object.defineProperty called on non-object"
  // sur components/sign/PDFViewer.tsx au runtime.
  transpilePackages: ['react-pdf', 'pdfjs-dist'],
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
      // Note: pdfjs-dist path alias NOT added here — Turbopack ne supporte pas les
      // chemins absolus dans resolveAlias (erreur "server relative imports not implemented").
      // Le forçage de version pdfjs-dist est géré uniquement côté webpack (dev local --webpack).
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      // Force toute résolution de `pdfjs-dist` (même nested chez react-pdf) vers UNE version
      'pdfjs-dist': PDFJS_DIST_PATH,
    }
    return config
  },
  // Headers de sécurité (anti clickjacking, XSS, MIME sniffing, etc.)
  async headers() {
    const securityHeaders = [
      // v2.7.5 — SAMEORIGIN (pas DENY) : autorise iframes internes (preview PDF CV,
      // documents compliance, portail rapports) tout en bloquant les iframes externes.
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ]

    // Dev only — empêche le navigateur de mettre en cache les pages/chunks
    // Évite de voir une version précédente sans hard reset
    if (process.env.NODE_ENV === 'development') {
      securityHeaders.push(
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
      )
    }

    return [{ source: '/(.*)', headers: securityHeaders }]
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
