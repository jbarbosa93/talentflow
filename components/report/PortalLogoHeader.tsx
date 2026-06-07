'use client'

// TalentFlow Sign — En-tête simple avec le logo L-Agence, pour les pages du
// portail candidat hors Accueil (Profil, Documents, etc.). v2.10.38
// L'Accueil, lui, utilise CandidatWelcomeHeader (logo + salutation + météo).

import LogoLAgence from './LogoLAgence'

export default function PortalLogoHeader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px' }}>
      <LogoLAgence height={30} color="dark" />
    </div>
  )
}
