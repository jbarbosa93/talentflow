'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FolderInput, Camera, Copy, ArrowRight, Wrench } from 'lucide-react'

const OUTILS = [
  {
    href: '/parametres/import-masse',
    icon: FolderInput,
    title: 'Import en masse',
    description: 'Importez et traitez des centaines de CVs en lot. Analysez automatiquement les CVs via IA et ajoutez-les à votre base candidats.',
    color: '#3B82F6',
    colorSoft: 'rgba(59,130,246,0.12)',
    badge: 'IA',
  },
  {
    href: '/parametres/corriger-photos',
    icon: Camera,
    title: 'Corriger les photos',
    description: 'Détectez et recadrez automatiquement les photos de profil des candidats pour un rendu homogène.',
    color: '#8B5CF6',
    colorSoft: 'rgba(139,92,246,0.12)',
    badge: null,
  },
  {
    href: '/parametres/doublons',
    icon: Copy,
    title: 'Analyser les doublons',
    description: 'Identifiez et fusionnez les profils candidats en doublon pour garder une base de données propre.',
    color: '#10B981',
    colorSoft: 'rgba(16,185,129,0.12)',
    badge: null,
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, type: 'spring' as const, stiffness: 300, damping: 26 },
  }),
}

export default function OutilsPage() {
  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      <motion.div
        className="d-page-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ marginBottom: 32 }}
      >
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wrench size={22} style={{ color: 'var(--primary)' }} />
            Outils
          </h1>
          <p className="d-page-sub">Outils de gestion et d'optimisation de votre base candidats</p>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
        {OUTILS.map((outil, i) => {
          const Icon = outil.icon
          return (
            <motion.div
              key={outil.href}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="show"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <Link href={outil.href} style={{ textDecoration: 'none', display: 'block' }}>
                <div className="neo-card-soft" style={{ padding: 24, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
                  {/* Top accent bar */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${outil.color}, ${outil.color}88)`,
                    borderRadius: '14px 14px 0 0',
                  }} />

                  {/* Icon */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: outil.colorSoft,
                    border: `1.5px solid ${outil.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16, marginTop: 8,
                  }}>
                    <Icon size={22} style={{ color: outil.color }} />
                  </div>

                  {/* Title + badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                      {outil.title}
                    </h2>
                    {outil.badge && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 100, background: 'var(--primary)', color: '#0F172A', letterSpacing: '0.05em' }}>
                        {outil.badge}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0, marginBottom: 20 }}>
                    {outil.description}
                  </p>

                  {/* CTA arrow */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <ArrowRight size={16} style={{ color: outil.color }} />
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
