'use client'
// components/PendingValidationPanel.tsx
// v1.9.31 — Panneau affiché dans /integrations pour valider les CVs en attente
// (score 8-10 strictExact + ville seule, sans contact fort).
//
// 3 actions possibles par fichier :
//   ✅ Oui même candidat  → POST action=confirm (update fiche existante)
//   ❌ Non créer nouveau  → POST action=reject (INSERT nouvelle fiche)
//   🗑️ Ignorer           → POST action=ignore (archive fichier sans action)
//
// Diff side-by-side : candidat suspect DB ↔ données CV extraites.

import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, Eye, UserCircle2, Check, X, Archive, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

type PendingFichier = {
  id: string
  nom_fichier: string
  traite_le: string | null
  last_modified_at: string | null
  match_suspect_score: number | null
  cv_url_temp: string | null
  analyse_json: any
  erreur: string | null
  candidat_suspect: {
    id: string
    nom: string | null
    prenom: string | null
    email: string | null
    telephone: string | null
    date_naissance: string | null
    localisation: string | null
    titre_poste: string | null
    cv_nom_fichier: string | null
  } | null
}

export default function PendingValidationPanel() {
  const [fichiers, setFichiers] = useState<PendingFichier[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch('/api/onedrive/pending-validation', { cache: 'no-store' })
      if (!res.ok) { setFichiers([]); return }
      const data = await res.json() as { fichiers: PendingFichier[]; count: number }
      setFichiers(data.fichiers || [])
      // Broadcast pour Sidebar
      try { window.dispatchEvent(new CustomEvent('talentflow:pending-validation-changed', { detail: data.count })) } catch {}
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
    const onFocus = () => fetchList()
    window.addEventListener('focus', onFocus)
    const interval = setInterval(fetchList, 60_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [fetchList])

  const handleAction = async (id: string, action: 'confirm' | 'reject' | 'ignore') => {
    const labels = {
      confirm: '✅ Confirmer ? Le CV va REMPLACER les données du candidat existant.',
      reject: '❌ Créer une nouvelle fiche ? Le candidat suspect ne sera pas modifié.',
      ignore: '🗑️ Ignorer ? Le fichier sera archivé sans action.',
    }
    if (!window.confirm(labels[action])) return

    setActionId(id)
    try {
      const res = await fetch('/api/onedrive/pending-validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        window.alert(`Erreur : ${err.error || res.statusText}`)
      } else {
        await fetchList()
      }
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 18, textAlign: 'center' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    )
  }

  if (fichiers.length === 0) return null

  return (
    <div className="neo-card-soft" style={{ padding: 18, marginBottom: 14, borderLeft: '4px solid #F59E0B' }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--foreground)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={20} color="var(--warning)" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Fichiers en attente de confirmation ({fichiers.length})
          </h3>
        </div>
        {expanded ? <ChevronUp size={18} color="var(--muted)" /> : <ChevronDown size={18} color="var(--muted)" />}
      </button>

      {expanded && (
        <>
          <p style={{ margin: '8px 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Le moteur a trouvé un candidat existant qui pourrait correspondre, mais sans certitude suffisante (nom identique + ville, mais email/tel différents).
            Vérifie et décide pour chaque fichier.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fichiers.map(f => (
              <PendingFichierCard
                key={f.id}
                fichier={f}
                loading={actionId === f.id}
                onConfirm={() => handleAction(f.id, 'confirm')}
                onReject={() => handleAction(f.id, 'reject')}
                onIgnore={() => handleAction(f.id, 'ignore')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sous-composant : une carte fichier ──────────────────────────────────────

function PendingFichierCard({
  fichier, loading, onConfirm, onReject, onIgnore,
}: {
  fichier: PendingFichier
  loading: boolean
  onConfirm: () => void
  onReject: () => void
  onIgnore: () => void
}) {
  const suspect = fichier.candidat_suspect
  const analyse = fichier.analyse_json || {}

  // Helper : afficher un champ avec badge "différent" si les valeurs diffèrent
  const renderField = (label: string, dbValue: any, cvValue: any) => {
    const dbDisplay = dbValue || '—'
    const cvDisplay = cvValue || '—'
    const isDifferent = !!dbValue && !!cvValue && String(dbValue).toLowerCase().trim() !== String(cvValue).toLowerCase().trim()
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
        <div style={{ color: 'var(--foreground)' }}>{dbDisplay}</div>
        <div style={{ color: isDifferent ? '#DC2626' : 'var(--foreground)', fontWeight: isDifferent ? 600 : 400 }}>
          {cvDisplay}
          {isDifferent && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--destructive)' }}>⚠️</span>}
        </div>
      </div>
    )
  }

  const suspectNom = `${suspect?.prenom || ''} ${suspect?.nom || ''}`.trim() || 'Candidat suspect'
  const cvNom = `${analyse.prenom || ''} ${analyse.nom || ''}`.trim() || '—'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--card-bg, #FFF)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)' }}>
            📄 {fichier.nom_fichier}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Score de confiance : <strong style={{ color: 'var(--warning)' }}>{fichier.match_suspect_score}/16</strong> ·{' '}
            {fichier.traite_le ? new Date(fichier.traite_le).toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {fichier.cv_url_temp && (
            <a
              href={fichier.cv_url_temp}
              target="_blank"
              rel="noopener noreferrer"
              className="neo-btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, borderRadius: 8, textDecoration: 'none' }}
            >
              <Eye size={12} /> Voir CV
            </a>
          )}
          {suspect && (
            <a
              href={`/candidats/${suspect.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="neo-btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, borderRadius: 8, textDecoration: 'none' }}
            >
              <UserCircle2 size={12} /> Voir fiche
            </a>
          )}
        </div>
      </div>

      {/* Diff side-by-side */}
      <div style={{ background: 'var(--input-bg, #F9FAFB)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--muted)', paddingBottom: 6, borderBottom: '1.5px solid var(--border)' }}>
          <div>CHAMP</div>
          <div>👤 CANDIDAT SUSPECT (DB)</div>
          <div>📄 CV IMPORTÉ</div>
        </div>
        {renderField('Nom complet', suspectNom, cvNom)}
        {renderField('Email', suspect?.email, analyse.email)}
        {renderField('Téléphone', suspect?.telephone, analyse.telephone)}
        {renderField('DDN', suspect?.date_naissance, analyse.date_naissance)}
        {renderField('Ville', suspect?.localisation, analyse.localisation)}
        {renderField('Poste', suspect?.titre_poste, analyse.titre_poste)}
      </div>

      {/* Boutons action */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: '1.5px solid #22C55E', background: 'var(--success-soft)', color: 'var(--success)',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          <Check size={13} /> Oui, même candidat
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onReject}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: '1.5px solid #F59E0B', background: 'var(--warning-soft)', color: 'var(--warning)',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          <X size={13} /> Non, créer nouveau
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onIgnore}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          <Archive size={13} /> Ignorer
        </button>
        {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />}
      </div>
    </div>
  )
}
