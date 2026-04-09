import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import Footer from '@/components/landing/Footer'

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — TalentFlow",
  description: "Conditions générales d'utilisation de la plateforme TalentFlow.",
}

export default function CguPage() {
  return (
    <div className="landing-root" style={{ background: '#FFFDF5', minHeight: '100vh' }}>
      <Navbar />
      <main className="l-legal">
        <Link href="/" className="l-legal-back">
          ← Retour à l&apos;accueil
        </Link>

        <div className="l-legal-badge">Légal</div>
        <h1>Conditions Générales d&apos;Utilisation</h1>
        <p className="l-legal-date">Version provisoire — Avril 2026</p>

        <div className="l-legal-card">
          <h2>📌 Présentation</h2>
          <p>
            TalentFlow est une plateforme ATS (Applicant Tracking System) destinée aux agences de recrutement,
            développée et exploitée depuis le Valais, Suisse. La plateforme est actuellement en phase de développement bêta.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>🔑 Accès à la plateforme</h2>
          <p>
            L&apos;accès à TalentFlow est restreint et soumis à invitation. Toute utilisation est réservée
            aux utilisateurs autorisés dans le cadre de leur activité professionnelle de recrutement.
            L&apos;utilisation à des fins personnelles ou non professionnelles est interdite.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>⚙️ Phase bêta</h2>
          <p>
            La plateforme est actuellement en phase bêta. À ce titre :
          </p>
          <ul>
            <li>Des interruptions de service ponctuelles peuvent survenir</li>
            <li>Les fonctionnalités peuvent évoluer sans préavis</li>
            <li>Aucune garantie de disponibilité continue n&apos;est offerte durant cette phase</li>
          </ul>
        </div>

        <div className="l-legal-card">
          <h2>📋 Responsabilités</h2>
          <p>
            L&apos;utilisateur est responsable de l&apos;exactitude des données qu&apos;il saisit et importe
            dans la plateforme. TalentFlow décline toute responsabilité en cas d&apos;usage non conforme
            aux présentes conditions ou à la législation en vigueur.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>⚖️ Droit applicable</h2>
          <p>
            Les présentes conditions sont régies par le droit suisse, notamment la Loi fédérale
            sur la protection des données (LPD). Tout litige relève de la compétence des tribunaux du Valais, Suisse.
          </p>
        </div>

        <div className="l-legal-notice">
          <strong>Ces conditions sont provisoires.</strong> Un formulaire de contact sera prochainement disponible
          pour toute question ou demande concernant les conditions d&apos;utilisation.
        </div>
      </main>
      <Footer />
    </div>
  )
}
