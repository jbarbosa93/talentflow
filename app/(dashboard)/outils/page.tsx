'use client'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FolderInput, Camera, Copy, ArrowRight, Wrench, ClipboardList, FileText, Play, Square, AlertTriangle } from 'lucide-react'

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
        <motion.div variants={cardVariants}>
          <ExtractCVTextCard />
        </motion.div>
      </motion.div>
    </div>
  )
}

// ─── Extract CV Text Card ───────────────────────────────────────────────────

function ExtractCVTextCard() {
  const [running, setRunning] = useState(false)
  const [traites, setTraites] = useState(0)
  const [restants, setRestants] = useState<number | null>(null)
  const [visionUsed, setVisionUsed] = useState(0)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const stopRef = useRef(false)

  const color = '#06B6D4'

  const start = useCallback(async () => {
    setRunning(true)
    setTraites(0)
    setRestants(null)
    setVisionUsed(0)
    setErreurs([])
    setDone(false)
    stopRef.current = false

    let totalTraites = 0
    let totalVision = 0

    while (!stopRef.current) {
      try {
        const res = await fetch('/api/outils/extract-cv-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_size: 5 }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Erreur serveur' }))
          setErreurs(prev => [...prev, err.error || `HTTP ${res.status}`])
          break
        }

        const data = await res.json()
        totalTraites += data.traites
        totalVision += data.vision_used || 0
        setTraites(totalTraites)
        setRestants(data.restants)
        setVisionUsed(totalVision)

        if (data.erreurs?.length > 0) {
          setErreurs(prev => [...prev, ...data.erreurs])
        }

        if (data.restants === 0 || data.traites === 0) {
          break
        }
      } catch (err: any) {
        setErreurs(prev => [...prev, err?.message || 'Erreur reseau'])
        break
      }
    }

    setRunning(false)
    setDone(true)
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
  }, [])

  const total = restants !== null ? traites + restants : 0
  const pct = total > 0 ? Math.round((traites / total) * 100) : 0

  return (
    <div style={{
      background: 'var(--card)',
      border: '1.5px solid var(--border)',
      borderRadius: 16,
      padding: 28,
      position: 'relative',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color}, ${color}66)`,
      }} />

      {/* Icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18, marginTop: 4 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: `${color}14`,
          border: `1.5px solid ${color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileText size={26} style={{ color }} />
        </div>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: 17, fontWeight: 800, color: 'var(--foreground)',
        margin: '0 0 8px 0', letterSpacing: '-0.01em',
      }}>
        Extraire texte CVs manquants
      </h3>

      {/* Description */}
      <p style={{
        fontSize: 13, color: 'var(--muted)', lineHeight: 1.65,
        margin: '0 0 18px 0', flex: 1,
      }}>
        Extrait le texte depuis les CVs stockes. Utilise la Vision IA pour les PDFs scannes (images).
      </p>

      {/* Progress */}
      {(running || done) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
              {traites} traite{traites > 1 ? 's' : ''}
              {restants !== null && ` / ${traites + restants} total`}
              {visionUsed > 0 && <span style={{ color: '#F59E0B', marginLeft: 6 }}>({visionUsed} scans IA)</span>}
            </span>
            {total > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
            )}
          </div>
          {/* Progress bar */}
          <div style={{
            height: 6, borderRadius: 3,
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: color,
              width: `${pct}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Errors */}
      {erreurs.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '8px 10px', borderRadius: 8,
          background: '#FEF2F2', border: '1px solid #FECACA',
          maxHeight: 100, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <AlertTriangle size={12} style={{ color: '#DC2626' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>
              {erreurs.length} erreur{erreurs.length > 1 ? 's' : ''}
            </span>
          </div>
          {erreurs.slice(-5).map((e, i) => (
            <div key={i} style={{ fontSize: 10, color: '#991B1B', lineHeight: 1.5 }}>{e}</div>
          ))}
        </div>
      )}

      {/* CTA buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {!running ? (
          <button
            onClick={start}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: color, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <Play size={14} />
            {done ? 'Relancer' : 'Lancer l\'extraction'}
          </button>
        ) : (
          <button
            onClick={stop}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#EF4444', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <Square size={14} />
            Stop
          </button>
        )}
      </div>
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
