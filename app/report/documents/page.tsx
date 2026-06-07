'use client'

// TalentFlow Sign — Documents (portail candidat). v2.10.35 — Placeholder Phase 1.
// La Phase 2 affichera ici les documents de la fiche candidat (conformité +
// généraux) et permettra d'en charger.

import { FolderOpen } from 'lucide-react'

export default function DocumentsPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 18px 90px' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 400, color: '#1C1A14', margin: '8px 0 20px' }}>Mes documents</h1>
      <div style={{ background: '#fff', border: '1px solid #ECEAE3', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
        <FolderOpen size={34} color="#D6D1C4" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14', marginBottom: 6 }}>Bientôt disponible</div>
        <p style={{ fontSize: 13.5, color: '#9A958A', lineHeight: 1.6, margin: 0 }}>
          Tu pourras bientôt consulter et envoyer tes documents (permis, carte d&apos;identité, etc.) directement depuis l&apos;application.
        </p>
      </div>
    </div>
  )
}
