'use client'
// components/ConfirmMatchModal.tsx
// v1.9.21 — Modale affichée quand /api/cv/parse retourne `confirmation_required`.
// 3 actions : ✅ Update existing / ❌ Create new / 👁️ View existing fiche.
// Checkbox "Apply to remaining matches" PAR ACTION (Update ou Create).
//
// Pattern portal obligatoire (CLAUDE.md règle 10) : position:fixed + createPortal(document.body).

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, UserPlus, ExternalLink, X } from 'lucide-react'

export type ConfirmMatchPayload = {
  candidat_existant: {
    id: string
    nom: string | null
    prenom: string | null
    email: string | null
    telephone: string | null
    date_naissance: string | null
    titre_poste: string | null
    localisation: string | null
    created_at: string | null
  }
  analyse_preview: {
    nom: string | null
    prenom: string | null
    email: string | null
    telephone: string | null
    date_naissance: string | null
    titre_poste: string | null
    localisation: string | null
  }
  score: {
    score: number
    ddnMatch: boolean
    telMatch: boolean
    emailMatch: boolean
    strictExact: boolean
    strictSubset: boolean
    villeMatch: boolean
  } | null
  reason: string | null
  diffs: Array<{ field: 'email' | 'telephone' | 'date_naissance'; from: string | null; to: string | null }>
  storage_path: string
  file_name: string
  file_date: string | null
  categorie: string | null
}

export type ConfirmMatchDecision = {
  action: 'update' | 'create' | 'view'
  applyToAll: boolean
}

interface Props {
  payload: ConfirmMatchPayload
  onDecide: (decision: ConfirmMatchDecision) => void
  onClose: () => void
  queueRemaining?: number // nombre de confirmations en attente derrière celle-ci
}

// Score max possible : DDN(10) + tel(8) + email(8) + strict_exact(5) + ville(3) = 34
const SCORE_MAX = 34

function scoreLabel(score: number): { text: string; color: string; bg: string } {
  if (score >= 20) return { text: 'Très élevé', color: 'var(--success)', bg: '#DCFCE7' }
  if (score >= 13) return { text: 'Élevé', color: 'var(--warning)', bg: '#FEF3C7' }
  if (score >= 8) return { text: 'Modéré', color: 'var(--warning)', bg: '#FEF3C7' }
  return { text: 'Faible', color: 'var(--destructive)', bg: '#FEE2E2' }
}

function signalBadges(score: ConfirmMatchPayload['score']): Array<{ label: string; ok: boolean }> {
  if (!score) return []
  return [
    { label: 'DDN', ok: score.ddnMatch },
    { label: 'Tél', ok: score.telMatch },
    { label: 'Email', ok: score.emailMatch },
    { label: 'Nom exact', ok: score.strictExact },
    { label: 'Nom partiel', ok: score.strictSubset && !score.strictExact },
    { label: 'Ville', ok: score.villeMatch },
  ].filter(b => b.ok) // on n'affiche que les signaux présents
}

function fmtDdn(s: string | null): string {
  if (!s) return '—'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  return s
}

function Row({ label, before, after, diff }: { label: string; before: string | null; after: string | null; diff?: boolean }) {
  const showDiff = diff && before && after && before !== after
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: showDiff ? '#DC2626' : '#374151', textDecoration: showDiff ? 'line-through' : 'none' }}>
        {before || '—'}
      </span>
      <span style={{ fontSize: 12, color: showDiff ? '#16A34A' : '#374151', fontWeight: showDiff ? 600 : 400 }}>
        {after || '—'}
      </span>
    </div>
  )
}

export default function ConfirmMatchModal({ payload, onDecide, onClose, queueRemaining = 0 }: Props) {
  const [mounted, setMounted] = useState(false)
  const [applyToAll, setApplyToAll] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Escape key → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!mounted || typeof window === 'undefined') return null

  const c = payload.candidat_existant
  const a = payload.analyse_preview
  const score = payload.score?.score ?? 0
  const label = scoreLabel(score)
  const badges = signalBadges(payload.score)
  const diffFields = new Set(payload.diffs.map(d => d.field))

  const ddnDifferent = diffFields.has('date_naissance') && !!(c.date_naissance && a.date_naissance)
  const fullName = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Candidat'

  const handleAction = (action: 'update' | 'create' | 'view') => {
    onDecide({ action, applyToAll: action !== 'view' && applyToAll })
  }

  const modal = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9500,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.15s ease',
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 9501, background: 'white', borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          width: 560, maxHeight: '90vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          animation: 'popIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} style={{ color: 'var(--warning)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Candidat potentiellement en doublon</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                {payload.file_name}
                {queueRemaining > 0 && <span style={{ marginLeft: 8, color: '#7C3AED', fontWeight: 600 }}>· {queueRemaining} autre{queueRemaining > 1 ? 's' : ''} en attente</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: '#F9FAFB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Fermer (Esc)"
          >
            <X size={14} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {/* Score */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Score de correspondance</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)' }}>{score}<span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 500 }}> / {SCORE_MAX}</span></span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: label.bg, color: label.color }}>
                {label.text}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--muted)', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (score / SCORE_MAX) * 100)}%`, background: `linear-gradient(90deg, ${label.color}, ${label.color}dd)`, borderRadius: 100, transition: 'width 0.3s' }} />
            </div>
            {badges.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {badges.map(b => (
                  <span key={b.label} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--success-soft)', color: 'var(--success)', fontWeight: 600 }}>
                    ✓ {b.label}
                  </span>
                ))}
              </div>
            )}
            {payload.reason && (
              <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Raison : {payload.reason}</p>
            )}
          </div>

          {/* Candidat existant — entête */}
          <div style={{ padding: '10px 12px', background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{fullName}</p>
            {c.titre_poste && <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{c.titre_poste}</p>}
            {c.created_at && <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>En base depuis le {new Date(c.created_at).toLocaleDateString('fr-CH')}</p>}
          </div>

          {/* Table comparaison */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '2px 12px', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: 8, paddingTop: 8, paddingBottom: 4, borderBottom: '1px solid #E5E7EB' }}>
              <span />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Fiche existante</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>CV importé</span>
            </div>
            <Row label="Nom" before={c.nom} after={a.nom} />
            <Row label="Prénom" before={c.prenom} after={a.prenom} />
            <Row label="Email" before={c.email} after={a.email} diff={diffFields.has('email')} />
            <Row label="Téléphone" before={c.telephone} after={a.telephone} diff={diffFields.has('telephone')} />
            <Row label="DDN" before={fmtDdn(c.date_naissance)} after={fmtDdn(a.date_naissance)} diff={diffFields.has('date_naissance')} />
            <Row label="Ville" before={c.localisation} after={a.localisation} />
            <Row label="Titre" before={c.titre_poste} after={a.titre_poste} />
          </div>

          {/* Warning DDN */}
          {ddnDifferent && (
            <div style={{ padding: '8px 12px', background: 'var(--destructive-soft)', border: '1px solid var(--destructive-soft)', borderRadius: 6, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle size={14} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 11, color: 'var(--destructive)', lineHeight: 1.4 }}>
                <strong>Date de naissance différente</strong> — si c'est bien la même personne, modifiez la DDN manuellement après l'update. Sinon créez un nouveau candidat.
              </p>
            </div>
          )}

          {/* Checkbox apply-all */}
          {queueRemaining > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', background: 'var(--muted)', borderRadius: 6, marginBottom: 6, userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={e => setApplyToAll(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                Appliquer cette action aux <strong>{queueRemaining}</strong> autre{queueRemaining > 1 ? 's' : ''} confirmation{queueRemaining > 1 ? 's' : ''} en attente
              </span>
            </label>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, background: '#FAFAFA' }}>
          <button
            onClick={() => handleAction('view')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
            title="Ouvrir la fiche existante — stoppe la file d'import"
          >
            <ExternalLink size={13} /> Voir la fiche
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => handleAction('create')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #16A34A', background: 'white', cursor: 'pointer', color: 'var(--success)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
            title="Créer un nouveau candidat (pas le même)"
          >
            <UserPlus size={13} /> Créer nouveau
          </button>
          <button
            onClick={() => handleAction('update')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, border: 'none', background: '#3B82F6', cursor: 'pointer', color: 'white', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}
            title="Mettre à jour la fiche existante avec ce CV"
          >
            <Check size={13} /> Mettre à jour
          </button>
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes popIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.96) }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1) }
          }
        `}</style>
      </div>
    </>
  )

  return createPortal(modal, document.body)
}
