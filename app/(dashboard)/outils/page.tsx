'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FolderInput, Camera, Copy, ArrowRight, Wrench, ClipboardList } from 'lucide-react'

// ─── Outils ─────────────────────────────────────────────────────────────────

type OutilDef = {
  href: string
  icon: typeof FolderInput
  title: string
  description: string
  color: string
  badge?: string | null
}

const OUTILS: OutilDef[] = [
  {
    href: '/parametres/import-masse',
    icon: FolderInput,
    title: 'Import en masse',
    description: 'Importez des centaines de CVs en lot. Analyse IA automatique avec extraction des competences, experiences et coordonnees.',
    color: '#3B82F6',
    badge: 'IA',
  },
  {
    href: '/parametres/doublons',
    icon: Copy,
    title: 'Analyser les doublons',
    description: 'Recherche instantanee des candidats avec le meme email, telephone ou nom complet. Fusion guidee champ par champ.',
    color: '#10B981',
  },
  {
    href: '/parametres/corriger-photos',
    icon: Camera,
    title: 'Corriger les photos',
    description: 'Detection et recadrage automatique des photos de profil pour un rendu homogene sur toutes les fiches.',
    color: '#8B5CF6',
  },
  {
    href: '/outils/rapport-heures',
    icon: ClipboardList,
    title: 'Rapport d\'heures',
    description: 'Creation et envoi rapide des rapports de travail hebdomadaires par WhatsApp ou email.',
    color: '#F59E0B',
  },
]

// ─── Animations ──────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OutilsPage() {
  return (
    <div className="d-page" style={{ maxWidth: 900 }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ marginBottom: 36 }}
      >
        <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Wrench size={22} style={{ color: 'var(--primary)' }} />
          Outils
        </h1>
        <p className="d-page-sub">Optimisez et gerez votre base candidats</p>
      </motion.div>

      {/* Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 18,
        }}
      >
        {OUTILS.map(outil => (
          <OutilCard key={outil.href} outil={outil} />
        ))}
      </motion.div>
    </div>
  )
}

// ─── Card component ──────────────────────────────────────────────────────────

function OutilCard({ outil }: { outil: OutilDef }) {
  const Icon = outil.icon

  return (
    <motion.div variants={cardVariants}>
      <Link href={outil.href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
        <div style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: 16,
          padding: 28,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.transform = 'translateY(-4px)'
            el.style.boxShadow = '0 16px 40px rgba(0,0,0,0.10)'
            el.style.borderColor = outil.color + '60'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.transform = 'translateY(0)'
            el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
            el.style.borderColor = 'var(--border)'
          }}
        >
          {/* Top accent line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${outil.color}, ${outil.color}66)`,
          }} />

          {/* Icon + badge row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, marginTop: 4 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `${outil.color}14`,
              border: `1.5px solid ${outil.color}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={26} style={{ color: outil.color }} />
            </div>
            {outil.badge && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '3px 10px',
                borderRadius: 99, letterSpacing: '0.06em',
                background: outil.color === '#F59E0B' ? '#FEF3C7' : `${outil.color}18`,
                color: outil.color,
                border: `1px solid ${outil.color}30`,
              }}>
                {outil.badge}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 style={{
            fontSize: 17, fontWeight: 800, color: 'var(--foreground)',
            margin: '0 0 8px 0', letterSpacing: '-0.01em',
          }}>
            {outil.title}
          </h3>

          {/* Description */}
          <p style={{
            fontSize: 13, color: 'var(--muted)', lineHeight: 1.65,
            margin: '0 0 22px 0', flex: 1,
          }}>
            {outil.description}
          </p>

          {/* CTA */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 6, marginTop: 'auto',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: outil.color }}>
              Ouvrir
            </span>
            <ArrowRight size={15} style={{ color: outil.color }} />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
