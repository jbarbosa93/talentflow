import type { Metadata } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import "../globals.css"
import "./dashboard.css"
import { Toaster } from "sonner"
import ReactQueryProvider from "@/components/providers/ReactQueryProvider"
import { ImportProvider } from "@/contexts/ImportContext"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
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
      <body className={jakarta.variable}>
        <ReactQueryProvider>
          <ImportProvider>
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
          </ImportProvider>
        </ReactQueryProvider>
      </body>
    </html>
  )
}
