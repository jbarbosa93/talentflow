'use client'
import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, X, ChevronRight, CheckCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Link from 'next/link'

type Rappel = {
  id: string
  titre: string
  candidat_nom_manuel: string | null
  entreprise_nom: string | null
  poste: string | null
  date_heure: string
  rappel_date: string
  candidats: { nom: string; prenom: string | null } | null
}

export function ReminderPopup() {
  const [rappels, setRappels] = useState<Rappel[]>([])
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const queryClient = useQueryClient()

  const fetchRappels = useCallback(async () => {
    try {
      const res = await fetch('/api/entretiens/rappels')
      if (!res.ok) return
      const d = await res.json()
      setRappels(d.rappels ?? [])
    } catch {}
  }, [])

  // Chargement initial après 1s (laisse la page se stabiliser)
  useEffect(() => {
    const t = setTimeout(fetchRappels, 1000)
    return () => clearTimeout(t)
  }, [fetchRappels])

  // Affiche la popup si des rappels actifs et non dismissés
  useEffect(() => {
    if (rappels.length > 0 && !dismissed) {
      const t = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(t)
    }
  }, [rappels.length, dismissed])

  const markVu = async (ids: string[]) => {
    try {
      await fetch('/api/entretiens/rappels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setRappels(prev => prev.filter(r => !ids.includes(r.id)))
      queryClient.invalidateQueries({ queryKey: ['entretiens-rappels-count'] })
    } catch {}
  }

  const dismissAll = async () => {
    setVisible(false)
    setDismissed(true)
    await markVu(rappels.map(r => r.id))
  }

  const dismissOne = async (id: string) => {
    await markVu([id])
    if (rappels.length <= 1) {
      setVisible(false)
      setDismissed(true)
    }
  }

  const getCandidatNom = (r: Rappel) => {
    if (r.candidats) return `${r.candidats.prenom || ''} ${r.candidats.nom}`.trim()
    return r.candidat_nom_manuel || 'Candidat'
  }

  return (
    <AnimatePresence>
      {visible && rappels.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            width: 360,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(239,68,68,0.06)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(239,68,68,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bell size={15} color="#EF4444" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                {rappels.length} rappel{rappels.length > 1 ? 's' : ''} en attente
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                Entretiens / Suivi Candidat
              </div>
            </div>
            <button
              onClick={() => setVisible(false)}
              style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', borderRadius: 6 }}
            >
              <X size={15} />
            </button>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {rappels.map(r => (
              <div key={r.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>
                    {getCandidatNom(r)}
                  </div>
                  {r.poste && (
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 1 }}>
                      {r.poste}
                    </div>
                  )}
                  {r.entreprise_nom && (
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 2 }}>
                      {r.entreprise_nom}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
                    Rappel : {format(parseISO(r.rappel_date), 'd MMM yyyy', { locale: fr })}
                  </div>
                </div>
                <button
                  onClick={() => dismissOne(r.id)}
                  title="Marquer comme vu"
                  style={{
                    padding: '4px 6px',
                    border: '1px solid var(--border)',
                    background: 'var(--secondary)',
                    cursor: 'pointer',
                    borderRadius: 6,
                    color: 'var(--muted-foreground)',
                    flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            gap: 8,
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
          }}>
            <Link
              href="/entretiens"
              onClick={() => setVisible(false)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Voir les entretiens
              <ChevronRight size={13} />
            </Link>
            <button
              onClick={dismissAll}
              title="Tout marquer comme vu"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                border: '1px solid var(--border)',
                background: 'var(--secondary)',
                color: 'var(--foreground)',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <CheckCheck size={13} />
              Tout vu
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
