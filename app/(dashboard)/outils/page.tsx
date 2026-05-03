'use client'
import Link from 'next/link'
import { FolderInput, Camera, Copy, Wrench, ClipboardList, Sparkles } from 'lucide-react'

// ─── Outils V2 ──────────────────────────────────────────────────────────────

type OutilDef = {
  href: string
  icon: typeof FolderInput
  title: string
  description: string
  cta: string
  color: string       // accent foreground
  bg: string          // icon bg
}

const OUTILS: OutilDef[] = [
  {
    href: '/outils/analyser-candidats',
    icon: Sparkles,
    title: 'Analyser candidats',
    description: 'Audit IA en lot — détection doublons, complétude des fiches, qualité des CV',
    cta: 'Lancer un audit',
    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',
  },
  {
    href: '/outils/rapport-heures',
    icon: ClipboardList,
    title: 'Rapport heures',
    description: 'Générer rapport mensuel des heures déclarées par mission',
    cta: 'Générer un rapport',
    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',
  },
  {
    href: '/parametres/import-masse',
    icon: FolderInput,
    title: 'Import en masse',
    description: 'Importer des CV depuis un dossier ou un cloud — détection auto',
    cta: 'Démarrer un import',
    color: '#10B981', bg: 'rgba(16,185,129,0.12)',
  },
  {
    href: '/parametres/doublons',
    icon: Copy,
    title: 'Doublons',
    description: 'Détecter et fusionner les candidats en doublon',
    cta: 'Scanner',
    color: '#06B6D4', bg: 'rgba(6,182,212,0.12)',
  },
  {
    href: '/parametres/corriger-photos',
    icon: Camera,
    title: 'Corriger photos',
    description: 'Recadrer et harmoniser les photos de candidats',
    cta: 'Lancer',
    color: '#A855F7', bg: 'rgba(168,85,247,0.12)',
  },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OutilsPage() {
  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Header V2 */}
      <div className="d-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wrench size={22} color="var(--primary)" />
            Outils
          </h1>
          <p className="d-page-sub">Utilitaires métier — analyses, rapports, opérations groupées</p>
        </div>
      </div>

      {/* Grid V2 — 4 colonnes responsive */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
      }}>
        {OUTILS.map(outil => <OutilCardV2 key={outil.href} outil={outil} />)}
      </div>
    </div>
  )
}

// ─── Card V2 ─────────────────────────────────────────────────────────────────

function OutilCardV2({ outil }: { outil: OutilDef }) {
  const Icon = outil.icon
  return (
    <Link href={outil.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'var(--surface, var(--card))',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '18px 20px 16px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          cursor: 'pointer',
          transition: 'border-color 0.15s, transform 0.12s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = outil.color + '55'
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {/* Icon + title en ligne (style Paramètres) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: outil.bg, color: outil.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={20} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>
            {outil.title}
          </div>
        </div>

        {/* Description */}
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, flex: 1 }}>
          {outil.description}
        </div>

        {/* CTA */}
        <div style={{
          fontSize: 12, fontWeight: 500, color: outil.color,
          marginTop: 'auto',
        }}>
          {outil.cta} →
        </div>
      </div>
    </Link>
  )
}
