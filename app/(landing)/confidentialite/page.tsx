import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import Footer from '@/components/landing/Footer'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — TalentFlow',
  description: 'Politique de confidentialité et traitement des données personnelles — TalentFlow.',
}

export default function ConfidentialitePage() {
  return (
    <div className="landing-root" style={{ background: '#FFFDF5', minHeight: '100vh' }}>
      <Navbar />
      <main className="l-legal">
        <Link href="/" className="l-legal-back">
          ← Retour à l&apos;accueil
        </Link>

        <div className="l-legal-badge">Légal</div>
        <h1>Politique de confidentialité</h1>
        <p className="l-legal-date">Version provisoire — Avril 2026</p>

        <div className="l-legal-card">
          <h2>🔐 Responsable du traitement</h2>
          <p>
            TalentFlow, exploitant basé en Valais, Suisse, est responsable du traitement
            des données personnelles collectées via la plateforme.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>📂 Données collectées</h2>
          <p>Dans le cadre de l&apos;utilisation de TalentFlow, les données suivantes peuvent être traitées :</p>
          <ul>
            <li>Données des candidats importés (CV, coordonnées, expériences)</li>
            <li>Données des utilisateurs de la plateforme (email, préférences)</li>
            <li>Données d&apos;usage et logs d&apos;activité</li>
          </ul>
        </div>

        <div className="l-legal-card">
          <h2>🌍 Hébergement et localisation</h2>
          <p>
            Les données sont hébergées sur des serveurs via Supabase (infrastructure PostgreSQL) et Vercel.
            Le traitement s&apos;effectue dans le respect des exigences de la LPD (Loi fédérale suisse
            sur la protection des données) et du RGPD européen.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>🚫 Partage des données</h2>
          <p>
            Aucune donnée personnelle n&apos;est vendue ni partagée avec des tiers à des fins commerciales.
            Les données peuvent être transmises à des sous-traitants techniques strictement nécessaires
            au fonctionnement de la plateforme (hébergement, analyse IA), dans le respect de la LPD.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>⏱️ Durée de conservation</h2>
          <p>
            Les données sont conservées aussi longtemps que nécessaire à l&apos;activité de recrutement
            ou jusqu&apos;à demande de suppression. Les données des comptes inactifs peuvent être supprimées
            après une période de 12 mois.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>✅ Vos droits (LPD)</h2>
          <p>Conformément à la LPD, vous disposez des droits suivants :</p>
          <ul>
            <li>Droit d&apos;accès à vos données personnelles</li>
            <li>Droit de rectification des données inexactes</li>
            <li>Droit à l&apos;effacement (droit à l&apos;oubli)</li>
            <li>Droit à la portabilité de vos données</li>
          </ul>
        </div>

        <div className="l-legal-notice">
          <strong>Pour exercer vos droits</strong>, un formulaire de contact sera prochainement disponible.
          Cette politique de confidentialité est provisoire et sera mise à jour lors du lancement officiel de la plateforme.
        </div>
      </main>
      <Footer />
    </div>
  )
}
