import { Nunito, Fraunces } from "next/font/google"
import type { Metadata } from "next"
import "../globals.css"
import "./landing.css"

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "500", "600", "700"],
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: "TalentFlow — Recrutez avec clarté et efficacité",
  description:
    "Centralisez vos communications candidats, analysez les CVs avec l'IA, pilotez votre pipeline de recrutement.",
}

export default function LandingRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body
        className={`${nunito.variable} ${fraunces.variable} landing-root`}
        style={{
          fontFamily: "var(--font-nunito), 'Nunito', sans-serif",
          background: "#FFFDF5",
          color: "#1C1A14",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {children}
      </body>
    </html>
  )
}
