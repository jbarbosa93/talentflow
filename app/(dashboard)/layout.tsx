import type { Metadata, Viewport } from "next"
import { DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google"
import "../globals.css"
import "./dashboard.css"
import "flag-icons/css/flag-icons.min.css"
import { Toaster } from "sonner"
import ReactQueryProvider from "@/components/providers/ReactQueryProvider"
import { ImportProvider } from "@/contexts/ImportContext"
import { MatchingProvider } from "@/contexts/MatchingContext"
import { PhotosProvider } from "@/contexts/PhotosContext"
import { DoublonsProvider } from "@/contexts/DoublonsContext"
import { UploadProvider } from "@/contexts/UploadContext"
import DashboardShell from "@/components/layout/DashboardShell"
import { SessionTimeoutModal } from "@/components/SessionTimeoutModal"
import GlobalUploadPanel from "@/components/GlobalUploadPanel"
import { SpeedInsights } from "@vercel/speed-insights/next"

const jakarta = DM_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "TalentFlow ATS",
  description: "Système de gestion du recrutement",
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F7C948',
}

export default function DashboardRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${jakarta.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
        <ReactQueryProvider>
          <ImportProvider>
            <MatchingProvider>
              <PhotosProvider>
                <DoublonsProvider>
                  <UploadProvider>
                    <DashboardShell>
                      {children}
                    </DashboardShell>
                    <GlobalUploadPanel />
                    <SessionTimeoutModal />
                    {/* v1.9.127 — Toast style design v2 (subtil, plus de fond vert flashy) */}
                    <Toaster
                      position="top-right"
                      toastOptions={{
                        style: {
                          background: 'var(--surface, var(--card))',
                          border: '1px solid var(--border)',
                          color: 'var(--text, var(--foreground))',
                          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                          fontSize: 13.5,
                          fontWeight: 500,
                          boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,.12))',
                          borderRadius: 12,
                        },
                        className: 'tf-toast-v2',
                      }}
                    />
                    <SpeedInsights />
                  </UploadProvider>
                </DoublonsProvider>
              </PhotosProvider>
            </MatchingProvider>
          </ImportProvider>
        </ReactQueryProvider>
      </body>
    </html>
  )
}
