import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
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
