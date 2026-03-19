import type { Metadata } from "next"
import { Nunito, Fraunces } from "next/font/google"
import "../globals.css"
import "./dashboard.css"
import { Toaster } from "sonner"
import ReactQueryProvider from "@/components/providers/ReactQueryProvider"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
})

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: "TalentFlow ATS",
  description: "Système de gestion du recrutement",
}

export default function DashboardRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${nunito.variable} ${fraunces.variable}`}>
        <ReactQueryProvider>
          <div className="d-layout">
            <Sidebar />
            <div className="d-main">
              <TopBar />
              <main className="d-content">
                {children}
              </main>
            </div>
          </div>
          <Toaster richColors position="top-right" />
        </ReactQueryProvider>
      </body>
    </html>
  )
}
