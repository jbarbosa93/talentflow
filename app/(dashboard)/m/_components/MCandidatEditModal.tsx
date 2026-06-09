'use client'
// Modal d'édition d'un candidat depuis l'app (/m) — champs sûrs uniquement.
// ⚠️ date_naissance & genre NON éditables (règle métier : immuables).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Check, Loader2 } from 'lucide-react'
import { useMetiers } from '@/hooks/useMetiers'

interface EditableCandidat {
  id: string
  prenom?: string | null
  nom?: string | null
  email?: string | null
  telephone?: string | null
  telephone_2?: string | null
  localisation?: string | null
  titre_poste?: string | null
  tags?: string[] | null
}

export default function MCandidatEditModal({
  candidat,
  onClose,
}: {
  candidat: EditableCandidat
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { metiers } = useMetiers()
  const [form, setForm] = useState({
    prenom: candidat.prenom || '',
    nom: candidat.nom || '',
    email: candidat.email || '',
    telephone: candidat.telephone || '',
    telephone_2: candidat.telephone_2 || '',
    localisation: candidat.localisation || '',
    titre_poste: candidat.titre_poste || '',
  })
  const [tags, setTags] = useState<string[]>((candidat.tags || []).filter((t) => metiers.includes(t)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggleTag = (m: string) =>
    setTags((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))

  async function save() {
    setSaving(true)
    setError('')
    try {
      // On préserve les tags hors-liste-agence existants + on ajoute la sélection.
      const otherTags = (candidat.tags || []).filter((t) => !metiers.includes(t))
      const payload = {
        prenom: form.prenom.trim() || null,
        nom: form.nom.trim() || null,
        email: form.email.trim() || null,
        telephone: form.telephone.trim() || null,
        telephone_2: form.telephone_2.trim() || null,
        localisation: form.localisation.trim() || null,
        titre_poste: form.titre_poste.trim() || null,
        tags: [...otherTags, ...tags],
      }
      const r = await fetch(`/api/candidats/${candidat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || 'Échec de la mise à jour')
      }
      qc.invalidateQueries({ queryKey: ['m', 'candidat', candidat.id] })
      qc.invalidateQueries({ queryKey: ['m', 'candidats'] })
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erreur')
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 16,
    border: '1px solid var(--m-border, #e7e5df)', background: '#fff', color: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--m-text-soft, #6b6657)', margin: '12px 0 5px',
    textTransform: 'uppercase', letterSpacing: 0.3,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1 }} onClick={onClose} />
      <div
        style={{
          background: 'var(--m-bg, #FAFAF7)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 20px)', overflowY: 'auto',
          padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Modifier le candidat</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 6 }} aria-label="Fermer"><X size={22} /></button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Prénom</div>
            <input style={inputStyle} value={form.prenom} onChange={set('prenom')} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Nom</div>
            <input style={inputStyle} value={form.nom} onChange={set('nom')} />
          </div>
        </div>

        <div style={labelStyle}>Email</div>
        <input style={inputStyle} type="email" value={form.email} onChange={set('email')} autoCapitalize="off" />

        <div style={labelStyle}>Téléphone</div>
        <input style={inputStyle} type="tel" value={form.telephone} onChange={set('telephone')} />

        <div style={labelStyle}>Téléphone 2</div>
        <input style={inputStyle} type="tel" value={form.telephone_2} onChange={set('telephone_2')} />

        <div style={labelStyle}>Localisation</div>
        <input style={inputStyle} value={form.localisation} onChange={set('localisation')} placeholder="Ville, Pays" />

        <div style={labelStyle}>Titre / poste (CV)</div>
        <input style={inputStyle} value={form.titre_poste} onChange={set('titre_poste')} />

        <div style={labelStyle}>Métiers assignés</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {metiers.map((m) => {
            const on = tags.includes(m)
            return (
              <button
                key={m}
                onClick={() => toggleTag(m)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 999,
                  border: `1px solid ${on ? 'var(--m-yellow, #F7C948)' : 'var(--m-border, #e7e5df)'}`,
                  background: on ? 'var(--m-yellow, #F7C948)' : '#fff',
                  color: on ? '#1C1A14' : 'var(--m-text-soft, #6b6657)',
                }}
              >
                {m}
              </button>
            )
          })}
        </div>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <button
          onClick={save}
          disabled={saving}
          className="m-btn primary full"
          style={{ marginTop: 18, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
