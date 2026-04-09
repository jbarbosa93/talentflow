import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import Footer from '@/components/landing/Footer'

export const metadata: Metadata = {
  title: 'Mentions légales — TalentFlow',
  description: 'Mentions légales de la plateforme TalentFlow.',
}

export default function MentionsLegalesPage() {
  return (
    <div className="landing-root" style={{ background: '#FFFDF5', minHeight: '100vh' }}>
      <Navbar />
      <main className="l-legal">
        <Link href="/" className="l-legal-back">
          ← Retour à l&apos;accueil
        </Link>

        <div className="l-legal-badge">Légal</div>
        <h1>Mentions légales</h1>
        <p className="l-legal-date">Version provisoire — Avril 2026</p>

        <div className="l-legal-card">
          <h2>🏢 Éditeur</h2>
          <p>
            <strong>TalentFlow</strong><br />
            Valais, Suisse<br />
            Plateforme en phase de développement bêta.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>🖥️ Hébergement</h2>
          <p>La plateforme est hébergée par les prestataires suivants :</p>
          <ul>
            <li><strong>Vercel Inc.</strong> — Déploiement et infrastructure serveur (région EU)</li>
            <li><strong>Supabase</strong> — Base de données PostgreSQL et authentification</li>
          </ul>
        </div>

        <div className="l-legal-card">
          <h2>🤖 Intelligence artificielle</h2>
          <p>
            TalentFlow utilise l&apos;API Anthropic (Claude AI) pour l&apos;analyse et le parsing
            des CVs. Les données transmises à cette API sont traitées dans le respect
            des conditions d&apos;utilisation d&apos;Anthropic et de la LPD suisse.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>⚖️ Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble des contenus, interfaces et développements de TalentFlow sont
            la propriété exclusive de leurs auteurs. Toute reproduction ou utilisation
            sans autorisation expresse est interdite.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>📜 Droit applicable</h2>
          <p>
            La plateforme est soumise au droit suisse. La Loi fédérale sur la protection
            des données (LPD, RS 235.1) régit le traitement des données personnelles.
            En cas de litige, les tribunaux compétents sont ceux du Valais, Suisse.
          </p>
        </div>

        <div className="l-legal-notice">
          <strong>Ces mentions légales sont provisoires.</strong> Elles seront complétées lors du lancement
          officiel de la plateforme. Pour toute question, un formulaire de contact sera prochainement disponible.
        </div>
      </main>
      <Footer />
    </div>
  )
}
