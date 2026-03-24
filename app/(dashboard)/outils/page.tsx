'use client'
import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { FolderInput, Camera, Copy, ArrowRight, Wrench, SearchCheck, CalendarClock, Check, Loader2, UserCheck } from 'lucide-react'

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
  {
    href: '/outils/analyser-candidats',
    icon: SearchCheck,
    title: 'Analyser les candidats',
    description: 'Auditez la qualité de votre base candidats : photos, CVs, fiches incomplètes.',
    color: '#8B5CF6',
    colorSoft: 'rgba(139,92,246,0.12)',
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

function SyncDatesCard({ index }: { index: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ updated: number; skipped: number; total: number } | null>(null)

  const handleSync = async () => {
    if (state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/candidats/sync-dates', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setResult(data)
      setState('done')
    } catch (e: any) {
      setState('error')
    }
  }

  const color = '#F59E0B'
  const colorSoft = 'rgba(245,158,11,0.12)'

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      whileHover={{ y: state === 'loading' ? 0 : -4, boxShadow: state === 'loading' ? undefined : '0 12px 32px rgba(0,0,0,0.12)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div
        className="neo-card-soft"
        style={{ padding: 24, position: 'relative', overflow: 'hidden', cursor: state === 'loading' ? 'wait' : 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
        onClick={state === 'idle' || state === 'error' ? handleSync : undefined}
      >
        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          borderRadius: '14px 14px 0 0',
        }} />

        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: colorSoft,
          border: `1.5px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16, marginTop: 8,
        }}>
          {state === 'loading'
            ? <Loader2 size={22} style={{ color, animation: 'spin 1s linear infinite' }} />
            : state === 'done'
            ? <Check size={22} style={{ color: '#16A34A' }} />
            : <CalendarClock size={22} style={{ color }} />
          }
        </div>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Sync dates depuis fichiers
          </h2>
        </div>

        {/* Description / Result */}
        {state === 'done' && result ? (
          <p style={{ fontSize: 13, color: '#16A34A', lineHeight: 1.6, margin: 0, marginBottom: 20, fontWeight: 600 }}>
            ✓ {result.updated} candidat{result.updated > 1 ? 's' : ''} mis à jour · {result.skipped} sans date dans le nom du fichier
          </p>
        ) : state === 'error' ? (
          <p style={{ fontSize: 13, color: '#EF4444', lineHeight: 1.6, margin: 0, marginBottom: 20 }}>
            Erreur lors de la synchronisation. Cliquez pour réessayer.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0, marginBottom: 20 }}>
            Met à jour la date d&apos;ajout de chaque candidat selon la date trouvée dans le nom du fichier CV (format DD.MM.YYYY). Si aucune date → date originale conservée.
          </p>
        )}

        {/* CTA */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {state === 'loading'
            ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Traitement en cours…</span>
            : state === 'done'
            ? <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Terminé</span>
            : <ArrowRight size={16} style={{ color }} />
          }
        </div>
      </div>
    </motion.div>
  )
}

function SyncGenreCard({ index }: { index: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ updated: number; skipped: number; total: number } | null>(null)

  const handleSync = async () => {
    if (state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/candidats/sync-genre', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setResult(data)
      setState('done')
    } catch {
      setState('error')
    }
  }

  const color = '#8B5CF6'
  const colorSoft = 'rgba(139,92,246,0.12)'

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      whileHover={{ y: state === 'loading' ? 0 : -4, boxShadow: state === 'loading' ? undefined : '0 12px 32px rgba(0,0,0,0.12)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div
        className="neo-card-soft"
        style={{ padding: 24, position: 'relative', overflow: 'hidden', cursor: state === 'loading' ? 'wait' : 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
        onClick={state === 'idle' || state === 'error' ? handleSync : undefined}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          borderRadius: '14px 14px 0 0',
        }} />

        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: colorSoft, border: `1.5px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16, marginTop: 8,
        }}>
          {state === 'loading'
            ? <Loader2 size={22} style={{ color, animation: 'spin 1s linear infinite' }} />
            : state === 'done'
            ? <Check size={22} style={{ color: '#16A34A' }} />
            : <UserCheck size={22} style={{ color }} />
          }
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Détecter le genre
          </h2>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 100, background: color, color: 'white', letterSpacing: '0.05em' }}>
            IA
          </span>
        </div>

        {state === 'done' && result ? (
          <p style={{ fontSize: 13, color: '#16A34A', lineHeight: 1.6, margin: 0, marginBottom: 20, fontWeight: 600, flex: 1 }}>
            ✓ {result.updated} candidat{result.updated > 1 ? 's' : ''} mis à jour{result.skipped > 0 ? ` · ${result.skipped} non déterminé${result.skipped > 1 ? 's' : ''}` : ''}
          </p>
        ) : state === 'error' ? (
          <p style={{ fontSize: 13, color: '#EF4444', lineHeight: 1.6, margin: 0, marginBottom: 20, flex: 1 }}>
            Erreur lors de l&apos;analyse. Cliquez pour réessayer.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0, marginBottom: 20, flex: 1 }}>
            Analyse les prénoms via IA pour déterminer le genre (homme/femme) de chaque candidat qui n&apos;en a pas encore.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
          {state === 'loading'
            ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Analyse en cours…</span>
            : state === 'done'
            ? <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Terminé</span>
            : <ArrowRight size={16} style={{ color }} />
          }
        </div>
      </div>
    </motion.div>
  )
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
              <Link href={outil.href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                <div className="neo-card-soft" style={{ padding: 24, position: 'relative', overflow: 'hidden', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0, marginBottom: 20, flex: 1 }}>
                    {outil.description}
                  </p>

                  {/* CTA arrow */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                    <ArrowRight size={16} style={{ color: outil.color }} />
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}

        {/* Sync dates from filenames — action card */}
        <SyncDatesCard index={OUTILS.length} />

        {/* Sync genre — action card */}
        <SyncGenreCard index={OUTILS.length + 1} />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
