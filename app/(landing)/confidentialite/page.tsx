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
    <div className="landing-root landing-v2" style={{ background: '#FFFDF5', minHeight: '100vh' }}>
      <Navbar />
      <main className="l-legal">
        <Link href="/" className="l-legal-back">
          ← Retour à l&apos;accueil
        </Link>

        <div className="l-legal-badge">Légal</div>
        <h1>Politique de confidentialité</h1>
        <p className="l-legal-date">TalentFlow (site web + application « TalentFlow Sign ») — Dernière mise à jour : 3 juin 2026</p>

        <div className="l-legal-card">
          <h2>🔐 Responsable du traitement</h2>
          <p>
            <strong>L-Agence SA</strong>, agence de placement fixe et temporaire, Av. des Alpes 24,
            1870 Monthey, Suisse, est responsable du traitement de vos données personnelles.
            Contact : <a href="mailto:info@l-agence.ch">info@l-agence.ch</a> · +41 24 552 18 70.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>📂 Données que nous collectons</h2>
          <p>Dans le cadre de nos services de placement et de gestion des missions :</p>
          <ul>
            <li><strong>Identité et coordonnées</strong> : nom, prénom, date de naissance, adresse, e-mail, téléphone, photo.</li>
            <li><strong>Documents professionnels et légaux</strong> : CV, permis de travail / de séjour, pièce d&apos;identité, permis de conduire, CQC, carte AVS / assurance, RIB / coordonnées bancaires.</li>
            <li><strong>Données de mission et de travail</strong> : rapports d&apos;heures, dates et lieux de mission, entreprise utilisatrice.</li>
            <li><strong>Signature électronique</strong> : signature numérisée + journal (date, heure, IP) à des fins de preuve.</li>
            <li><strong>Données de l&apos;application</strong> (avec votre autorisation explicite) : <strong>caméra</strong> (photographier vos documents), <strong>localisation GPS</strong> au pointage (attester votre présence sur le chantier), <strong>identifiant d&apos;appareil</strong> pour les notifications. La biométrie (<strong>Face ID / Touch ID</strong>) est traitée localement par votre téléphone — nous n&apos;y avons jamais accès.</li>
          </ul>
        </div>

        <div className="l-legal-card">
          <h2>🎯 Finalités et bases légales</h2>
          <p>Nous traitons vos données pour la gestion de votre placement et de vos missions (exécution du contrat),
            l&apos;établissement des contrats, rapports d&apos;heures et documents de conformité (obligation légale),
            la transmission de votre dossier aux entreprises clientes (consentement), et la communication avec vous.
            Le traitement repose sur votre <strong>consentement</strong>, l&apos;<strong>exécution du contrat</strong> et nos <strong>obligations légales</strong>.</p>
        </div>

        <div className="l-legal-card">
          <h2>🌍 Hébergement et localisation</h2>
          <p>
            Vos données sont hébergées sur des serveurs situés dans l&apos;<strong>Union européenne (Irlande)</strong>
            (Supabase et Vercel). La Suisse reconnaissant un niveau de protection adéquat avec l&apos;UE, cet hébergement
            est conforme à la nLPD suisse et au RGPD européen.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>🚫 Partage des données</h2>
          <p>
            Vos données ne sont <strong>jamais vendues</strong>. Elles peuvent être partagées uniquement avec les
            <strong> entreprises clientes</strong> auprès desquelles vous êtes placé(e), dans la stricte mesure nécessaire,
            avec nos <strong>prestataires techniques</strong> (hébergement, e-mail) liés par la confidentialité, et avec
            les autorités lorsque la loi l&apos;exige.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>🔒 Sécurité</h2>
          <p>
            Mesures techniques et organisationnelles appropriées : chiffrement des communications (HTTPS), chiffrement
            des données sensibles, contrôle d&apos;accès strict, journalisation. L&apos;accès à l&apos;application peut être
            protégé par mot de passe et, en option, par Face ID / Touch ID.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>⏱️ Durée de conservation</h2>
          <p>
            Vos données sont conservées le temps nécessaire à la gestion de votre dossier et de nos missions, puis pendant
            les durées imposées par les obligations légales (comptables, sociales). Au-delà, elles sont supprimées ou anonymisées.
          </p>
        </div>

        <div className="l-legal-card">
          <h2>✅ Vos droits (nLPD / RGPD)</h2>
          <p>Vous disposez des droits suivants :</p>
          <ul>
            <li>Accéder à vos données et en obtenir une copie</li>
            <li>Les faire rectifier ou compléter</li>
            <li>En demander la suppression (droit à l&apos;oubli)</li>
            <li>Vous opposer à un traitement ou en demander la limitation</li>
            <li>Retirer votre consentement à tout moment (sans effet rétroactif)</li>
          </ul>
          <p>Pour exercer ces droits : <a href="mailto:info@l-agence.ch">info@l-agence.ch</a>.</p>
        </div>

        <div className="l-legal-card">
          <h2>📱 Notifications, caméra et localisation (application)</h2>
          <p>
            L&apos;application ne demande l&apos;accès à la caméra, à la localisation, à Face ID ou l&apos;envoi de notifications
            qu&apos;avec votre autorisation explicite. Vous pouvez les refuser ou les révoquer à tout moment dans les réglages
            de votre téléphone, sans perdre l&apos;accès aux fonctions essentielles.
          </p>
        </div>

        <div className="l-legal-notice">
          <strong>Contact :</strong> L-Agence SA, Av. des Alpes 24, 1870 Monthey —{' '}
          <a href="mailto:info@l-agence.ch">info@l-agence.ch</a> · +41 24 552 18 70.
        </div>
      </main>
      <Footer />
    </div>
  )
}
