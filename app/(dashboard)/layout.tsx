import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
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

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      <body className={jakarta.variable}>
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
                    <Toaster richColors position="top-right" />
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
