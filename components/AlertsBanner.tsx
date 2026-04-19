'use client'
// components/AlertsBanner.tsx
// Bannière d'alertes observabilité affichée sur /integrations.
// v1.9.18 : boutons résolution par anomalie (✅ Faux positif / 🔧 Corrigé) + historique collaboratif + tooltip.

import { useEffect, useState, useMemo } from 'react'
import { AlertTriangle, X, ChevronDown, ChevronUp, FileWarning, CloudOff, FileX, Check, Wrench, ExternalLink, History } from 'lucide-react'

type AnomalyType = 'texte_mismatch' | 'onedrive_mismatch' | 'cv_orphan'

type Anomaly = {
  id: string
  nom: string
  prenom: string
  cv_nom_fichier?: string | null
  nom_fichier?: string | null
  updated_at?: string | null
  traite_le?: string | null
  extrait?: string | null
  storage_path?: string | null
  onedrive_id?: string | null
}

type DetectPayload = {
  scan_at: string
  total: number
  texte_mismatch: Anomaly[]
  onedrive_mismatch: Anomaly[]
  cv_orphan: Anomaly[]
  duration_ms?: number
  error?: string
}

type HistoryEntry = {
  candidat_id: string
  anomaly_type: AnomalyType
  resolution: 'faux_positif' | 'corrige'
  resolved_by_email: string | null
  resolved_at: string
  nom: string
  prenom: string
  note?: string | null
}

const SECTION_KEY: Record<'texte' | 'onedrive' | 'orphan', AnomalyType> = {
  texte: 'texte_mismatch',
  onedrive: 'onedrive_mismatch',
  orphan: 'cv_orphan',
}

export default function AlertsBanner() {
  const [data, setData] = useState<DetectPayload | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [openSection, setOpenSection] = useState<'texte' | 'onedrive' | 'orphan' | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [resAnom, resHist] = await Promise.all([
          fetch('/api/admin/detect-anomalies', { cache: 'no-store' }),
          fetch('/api/admin/anomalies-resolve?history=1', { cache: 'no-store' }),
        ])
        if (!resAnom.ok) {
          if (resAnom.status === 403 || resAnom.status === 401) {
            if (!cancelled) { setDismissed(true); setLoading(false) }
            return
          }
          const j = await resAnom.json().catch(() => ({}))
          if (!cancelled) {
            setData({ ...(j as any), scan_at: '', total: 0, texte_mismatch: [], onedrive_mismatch: [], cv_orphan: [], error: j.error || `HTTP ${resAnom.status}` })
            setLoading(false)
          }
          return
        }
        const j = (await resAnom.json()) as DetectPayload
        if (!cancelled) setData(j)
        if (resHist.ok) {
          const h = await resHist.json()
          if (!cancelled) setHistory(Array.isArray(h.history) ? h.history : [])
        }
      } catch (e) {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Map candidat_id+type → HistoryEntry pour tooltip "résolu récemment"
  const resolvedMap = useMemo(() => {
    const m = new Map<string, HistoryEntry>()
    for (const h of history) m.set(`${h.candidat_id}:${h.anomaly_type}`, h)
    return m
  }, [history])

  if (loading || dismissed) return null
  if (!data) return null

  const total =
    (data.texte_mismatch?.length || 0) +
    (data.onedrive_mismatch?.length || 0) +
    (data.cv_orphan?.length || 0)

  if (total === 0 && history.length === 0) return null

  const toggle = (s: 'texte' | 'onedrive' | 'orphan') => setOpenSection(prev => prev === s ? null : s)

  const refreshHistory = async () => {
    try {
      const r = await fetch('/api/admin/anomalies-resolve?history=1', { cache: 'no-store' })
      if (r.ok) {
        const h = await r.json()
        setHistory(Array.isArray(h.history) ? h.history : [])
      }
    } catch {}
  }

  const bulkResolveFauxPositif = async (section: 'texte' | 'onedrive' | 'orphan') => {
    const type = SECTION_KEY[section]
    const items = section === 'texte' ? data.texte_mismatch
      : section === 'onedrive' ? data.onedrive_mismatch
      : data.cv_orphan
    if (items.length === 0) return
    if (!window.confirm(`Marquer les ${items.length} anomalie${items.length > 1 ? 's' : ''} de cette section comme FAUX POSITIF ?\n\nCette action peut être annulée individuellement depuis l'historique.`)) return

    // Marquer tout en busy
    const keys = items.map(a => `${a.id}:${type}`)
    setBusy(b => { const nb = { ...b }; for (const k of keys) nb[k] = true; return nb })

    try {
      await Promise.all(items.map(a =>
        fetch('/api/admin/anomalies-resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidat_id: a.id, anomaly_type: type, resolution: 'faux_positif' }),
        }).catch(() => null)
      ))
      // Retrait optimiste : vider la section
      setData(prev => prev ? ({ ...prev, [type]: [] } as DetectPayload) : prev)
      await refreshHistory()
    } finally {
      setBusy(b => { const nb = { ...b }; for (const k of keys) delete nb[k]; return nb })
    }
  }

  const resolve = async (candidat_id: string, anomaly_type: AnomalyType, resolution: 'faux_positif' | 'corrige', section: 'texte' | 'onedrive' | 'orphan') => {
    const key = `${candidat_id}:${anomaly_type}`
    setBusy(b => ({ ...b, [key]: true }))
    try {
      const res = await fetch('/api/admin/anomalies-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidat_id, anomaly_type, resolution }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert('Erreur : ' + (j.error || res.status))
        return
      }
      // Optimistic : retirer de la liste
      setData(prev => {
        if (!prev) return prev
        const field = anomaly_type as keyof DetectPayload
        const arr = (prev as any)[field] as Anomaly[]
        return { ...prev, [field]: arr.filter(a => a.id !== candidat_id) } as DetectPayload
      })
      await refreshHistory()
    } finally {
      setBusy(b => { const nb = { ...b }; delete nb[key]; return nb })
    }
  }

  const sectionBtn = (s: 'texte' | 'onedrive' | 'orphan', label: string, count: number, Icon: any, color: string) => (
    <button
      onClick={() => toggle(s)}
      disabled={count === 0}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: count === 0 ? 'rgba(0,0,0,0.03)' : `${color}1a`,
        border: `1px solid ${count === 0 ? 'var(--border)' : `${color}55`}`,
        borderRadius: 8, cursor: count === 0 ? 'default' : 'pointer',
        fontSize: 12, fontWeight: 700, color: count === 0 ? 'var(--muted)' : color,
        opacity: count === 0 ? 0.5 : 1,
      }}
    >
      <Icon size={14} />
      {label} <span style={{ background: count > 0 ? color : 'transparent', color: count > 0 ? '#fff' : 'var(--muted)', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{count}</span>
      {count > 0 && (openSection === s ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )

  const list = openSection === 'texte' ? data.texte_mismatch
    : openSection === 'onedrive' ? data.onedrive_mismatch
    : openSection === 'orphan' ? data.cv_orphan
    : []

  const currentType: AnomalyType | null = openSection ? SECTION_KEY[openSection] : null

  const actionBtn = (onClick: () => void, title: string, disabled: boolean, bg: string, fg: string, border: string, Icon: any, label: string) => (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '5px 9px', fontSize: 11, fontWeight: 700,
        background: bg, color: fg, border: `1px solid ${border}`,
        borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  )

  return (
    <div style={{
      background: 'rgba(245, 166, 35, 0.08)',
      border: '2px solid rgba(245, 166, 35, 0.4)',
      borderRadius: 14,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={20} color="#F5A623" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)' }}>
              {total === 0
                ? 'Aucune anomalie détectée'
                : `${total} anomalie${total > 1 ? 's' : ''} détectée${total > 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Scan {data.scan_at ? new Date(data.scan_at).toLocaleString('fr-CH') : '—'}
              {data.duration_ms ? ` · ${data.duration_ms} ms` : ''}
              {history.length > 0 ? ` · ${history.length} résolue${history.length > 1 ? 's' : ''}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
              }}
              title="Historique des résolutions"
            >
              <History size={12} /> Historique {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
            title="Masquer jusqu'au prochain chargement"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {sectionBtn('texte', 'CV texte ≠ nom', data.texte_mismatch.length, FileWarning, '#F5A623')}
          {sectionBtn('onedrive', 'Import OneDrive suspect', data.onedrive_mismatch.length, CloudOff, '#EF4444')}
          {sectionBtn('orphan', 'CV orphelin (storage vide)', data.cv_orphan.length, FileX, '#8B5CF6')}
        </div>
      )}

      {openSection && list.length > 0 && currentType && (
        <>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => bulkResolveFauxPositif(openSection)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', fontSize: 11, fontWeight: 700,
              background: 'rgba(34,197,94,0.1)', color: 'var(--success)',
              border: '1px solid rgba(34,197,94,0.4)', borderRadius: 6, cursor: 'pointer',
            }}
            title="Marquer toutes les anomalies de cette section comme faux positif (confirmation requise)"
          >
            <Check size={12} /> Tout marquer faux positif ({list.length})
          </button>
        </div>
        <div style={{
          marginTop: 8, maxHeight: 360, overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          {list.slice(0, 50).map((a, i) => {
            const key = `${a.id}:${currentType}`
            const isBusy = !!busy[key]
            const recent = resolvedMap.get(key) // peut être présent si on vient de refetch
            const tooltip = recent
              ? `Résolu ${recent.resolution === 'faux_positif' ? 'comme faux positif' : 'comme corrigé'} par ${recent.resolved_by_email || '?'} le ${new Date(recent.resolved_at).toLocaleString('fr-CH')}`
              : ''
            return (
              <div
                key={a.id + i}
                title={tooltip || undefined}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < Math.min(list.length, 50) - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 12, color: 'var(--foreground)',
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{a.prenom} {a.nom}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {openSection === 'texte' && (a.cv_nom_fichier || '—')}
                    {openSection === 'onedrive' && (a.nom_fichier || '—')}
                    {openSection === 'orphan' && (a.storage_path || a.cv_nom_fichier || '—')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {new Date(a.updated_at || a.traite_le || '').toLocaleDateString('fr-CH')}
                  </span>
                  {actionBtn(
                    () => window.open(`/candidats/${a.id}?from=integrations`, '_blank', 'noopener'),
                    'Ouvrir la fiche dans un nouvel onglet',
                    isBusy,
                    'transparent', 'var(--foreground)', 'var(--border)',
                    ExternalLink, 'Ouvrir'
                  )}
                  {actionBtn(
                    () => resolve(a.id, currentType, 'faux_positif', openSection!),
                    'Marquer comme faux positif (nom bien dans le CV, pas au début)',
                    isBusy,
                    'rgba(34,197,94,0.1)', '#16A34A', 'rgba(34,197,94,0.4)',
                    Check, 'Faux positif'
                  )}
                  {actionBtn(
                    () => resolve(a.id, currentType, 'corrige', openSection!),
                    'Marquer comme corrigé (fiche nettoyée manuellement)',
                    isBusy,
                    'rgba(59,130,246,0.1)', '#2563EB', 'rgba(59,130,246,0.4)',
                    Wrench, 'Corrigé'
                  )}
                </div>
              </div>
            )
          })}
          {list.length > 50 && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              +{list.length - 50} autres non affichés
            </div>
          )}
        </div>
        </>
      )}

      {showHistory && history.length > 0 && (
        <div style={{
          marginTop: 12, maxHeight: 280, overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <div style={{
            padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
            borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)',
          }}>
            Historique des {history.length} dernière{history.length > 1 ? 's' : ''} résolution{history.length > 1 ? 's' : ''}
          </div>
          {history.map((h, i) => (
            <a
              key={h.candidat_id + h.anomaly_type + i}
              href={`/candidats/${h.candidat_id}?from=integrations`}
              target="_blank"
              rel="noopener"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '8px 14px',
                borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 11, textDecoration: 'none', color: 'var(--foreground)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {h.prenom} {h.nom}
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 600,
                    padding: '1px 6px', borderRadius: 4,
                    background: h.resolution === 'faux_positif' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                    color: h.resolution === 'faux_positif' ? '#16A34A' : '#2563EB',
                  }}>
                    {h.resolution === 'faux_positif' ? '✅ Faux positif' : '🔧 Corrigé'}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>
                    · {h.anomaly_type}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  par {h.resolved_by_email || '?'} · {new Date(h.resolved_at).toLocaleString('fr-CH')}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
