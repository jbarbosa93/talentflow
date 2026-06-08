import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // v2.10.46 — 0.3 (au lieu de 1.0) : on enregistre un rejeu pour ~30% des
  // erreurs (suffisant pour debug) afin de ne plus saturer le quota de 50/mois.
  replaysOnErrorSampleRate: 0.3,
  replaysSessionSampleRate: 0.0,
  integrations: [Sentry.replayIntegration()],
  // Ignore les erreurs de télémétrie tierce (Speed Insights, analytics)
  // → failed fetches vers vitals.vercel-insights.com ne sont pas actionnables par nous
  ignoreErrors: [
    /vitals\.vercel-insights\.com/,
    /va\.vercel-scripts\.com/,
    // v2.9.10 — Promise rejections "TypeError: Failed to fetch" non actionables :
    // fetch() abandonné par le navigateur (close onglet, navigation pendant requête,
    // perte réseau passagère). Pas de bug à fix, juste du bruit.
    /Failed to fetch/i,
    /NetworkError/i,
    /Load failed/i, // équivalent Safari de "Failed to fetch"
    // v2.10.46 — Erreurs d'hydratation : quasi toujours causées par l'autofill /
    // gestionnaire de mots de passe iOS sur les champs login (la page fonctionne,
    // React re-rend côté client). Bruit non actionnable.
    /Hydration failed/i,
    /hydrating/i,
    /Text content does not match/i,
    /Minified React error #(418|419|421|422|423|424|425|426|488)/,
  ],
  denyUrls: [
    /vitals\.vercel-insights\.com/,
    /va\.vercel-scripts\.com/,
    /_vercel\/speed-insights/,
  ],
  // v2.9.10 — Drop les unhandled rejections AbortError aussi
  beforeSend(event, hint) {
    const err = hint?.originalException as { name?: string; message?: string } | undefined
    if (err?.name === 'AbortError') return null
    return event
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
