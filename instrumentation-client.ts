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
  ],
  denyUrls: [
    /vitals\.vercel-insights\.com/,
    /va\.vercel-scripts\.com/,
    /_vercel\/speed-insights/,
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
