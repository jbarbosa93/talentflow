'use client'
// components/AlertsBanner.tsx
// Bannière d'alertes admin affichée sur /integrations au chargement.
// Appelle /api/admin/detect-anomalies (admin only) et affiche un résumé cliquable.
// Zéro modification du code existant — purement additif.

import { useEffect, useState } from 'react'
import { AlertTriangle, X, ChevronDown, ChevronUp, FileWarning, CloudOff, FileX } from 'lucide-react'

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

export default function AlertsBanner() {
  const [data, setData] = useState<DetectPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [openSection, setOpenSection] = useState<'texte' | 'onedrive' | 'orphan' | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/detect-anomalies', { cache: 'no-store' })
        if (!res.ok) {
          // 403 = pas admin → on masque silencieusement
          if (res.status === 403 || res.status === 401) {
            if (!cancelled) { setDismissed(true); setLoading(false) }
            return
          }
          const j = await res.json().catch(() => ({}))
          if (!cancelled) { setData({ ...(j as any), scan_at: '', total: 0, texte_mismatch: [], onedrive_mismatch: [], cv_orphan: [], error: j.error || `HTTP ${res.status}` }); setLoading(false) }
          return
        }
        const j = (await res.json()) as DetectPayload
        if (!cancelled) { setData(j); setLoading(false) }
      } catch (e) {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading || dismissed) return null
  if (!data || data.total === 0) return null

  const toggle = (s: 'texte' | 'onedrive' | 'orphan') => setOpenSection(prev => prev === s ? null : s)

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
              {data.total} anomalie{data.total > 1 ? 's' : ''} détectée{data.total > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Scan {new Date(data.scan_at).toLocaleString('fr-CH')}
              {data.duration_ms ? ` · ${data.duration_ms} ms` : ''}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
          title="Masquer jusqu'au prochain chargement"
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {sectionBtn('texte', 'CV texte ≠ nom', data.texte_mismatch.length, FileWarning, '#F5A623')}
        {sectionBtn('onedrive', 'Import OneDrive suspect', data.onedrive_mismatch.length, CloudOff, '#EF4444')}
        {sectionBtn('orphan', 'CV orphelin (storage vide)', data.cv_orphan.length, FileX, '#8B5CF6')}
      </div>

      {openSection && list.length > 0 && (
        <div style={{
          marginTop: 12, maxHeight: 280, overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          {list.slice(0, 50).map((a, i) => (
            <a
              key={a.id + i}
              href={`/candidats/${a.id}?from=integrations`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: i < Math.min(list.length, 50) - 1 ? '1px solid var(--border)' : 'none',
                textDecoration: 'none', color: 'var(--foreground)', fontSize: 12,
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
              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 12, flexShrink: 0 }}>
                {new Date(a.updated_at || a.traite_le || '').toLocaleDateString('fr-CH')}
              </span>
            </a>
          ))}
          {list.length > 50 && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              +{list.length - 50} autres non affichés
            </div>
          )}
        </div>
      )}
    </div>
  )
}
