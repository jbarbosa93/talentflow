'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PhraseStyle } from '@/lib/motivational-phrases'

// Questionnaire affiché la 1ère fois qu'un consultant ouvre le dashboard.
// Propose 4 styles de phrases motivationnelles. Choix persisté dans user_metadata.phrase_style.
// Re-modifiable depuis /parametres/profil.

interface Props {
  onDone: (style: PhraseStyle) => void
}

interface Option {
  key: PhraseStyle
  emoji: string
  title: string
  description: string
  example: string
}

const OPTIONS: Option[] = [
  {
    key: 'factuel',
    emoji: '🎯',
    title: 'Factuel',
    description: 'Chiffres, objectifs, résultats concrets',
    example: '"Objectif jour : 5 candidats qualifiés."',
  },
  {
    key: 'motivant',
    emoji: '💪',
    title: 'Motivant',
    description: "Énergie, encouragement, élan",
    example: "\"Aujourd'hui est une bonne journée pour placer quelqu'un.\"",
  },
  {
    key: 'sage',
    emoji: '🧘',
    title: 'Sage',
    description: 'Proverbes métier, posture, réflexion',
    example: '"Un bon recrutement commence par une bonne écoute."',
  },
  {
    key: 'aleatoire',
    emoji: '🎲',
    title: 'Aléatoire',
    description: 'Un mix des trois styles, chaque jour différent',
    example: 'Surprise au réveil.',
  },
]

export default function PhraseStyleQuestionnaire({ onDone }: Props) {
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState<PhraseStyle | null>(null)

  useEffect(() => { setMounted(true) }, [])

  async function choose(style: PhraseStyle) {
    setSaving(style)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ data: { phrase_style: style } })
      if (error) throw error
      toast.success('Préférence enregistrée ✓')
      onDone(style)
    } catch (e: any) {
      toast.error(e?.message || 'Erreur enregistrement')
      setSaving(null)
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}
      >
        <motion.div
          initial={{ scale: 0.92, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 12, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          style={{
            width: '100%', maxWidth: 560,
            background: 'var(--card)',
            border: '1.5px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
            padding: 28,
          }}
        >
          <h2 style={{
            margin: 0, fontSize: 22, fontWeight: 800,
            color: 'var(--foreground)',
            fontFamily: 'var(--font-serif, Georgia, serif)',
          }}>
            Bienvenue sur TalentFlow 👋
          </h2>
          <p style={{ margin: '6px 0 20px', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            Chaque matin, le dashboard t'affiche une petite phrase. Quel style tu préfères ?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {OPTIONS.map(opt => (
              <motion.button
                key={opt.key}
                onClick={() => choose(opt.key)}
                disabled={saving !== null}
                whileHover={{ scale: saving ? 1 : 1.01 }}
                whileTap={{ scale: saving ? 1 : 0.99 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '14px 16px', borderRadius: 12,
                  background: saving === opt.key ? 'var(--primary-soft)' : 'var(--background)',
                  border: `1.5px solid ${saving === opt.key ? 'var(--primary)' : 'var(--border)'}`,
                  cursor: saving ? 'default' : 'pointer',
                  textAlign: 'left', fontFamily: 'inherit',
                  opacity: saving && saving !== opt.key ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{opt.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 2 }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    {opt.description}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                    {opt.example}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          <p style={{ margin: '18px 0 0', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            Tu pourras changer ce choix à tout moment dans ton profil.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
