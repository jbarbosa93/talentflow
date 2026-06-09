'use client'
// Formulaire client réutilisable (ajout + édition) — app /m
import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

export interface ClientFormValues {
  nom_entreprise: string
  adresse: string
  npa: string
  ville: string
  canton: string
  telephone: string
  email: string
  site_web: string
  notes: string
}

const EMPTY: ClientFormValues = {
  nom_entreprise: '', adresse: '', npa: '', ville: '', canton: '',
  telephone: '', email: '', site_web: '', notes: '',
}

export function toFormValues(c: Partial<ClientFormValues> | null | undefined): ClientFormValues {
  return { ...EMPTY, ...Object.fromEntries(Object.entries(c || {}).map(([k, v]) => [k, v ?? ''])) } as ClientFormValues
}

export default function MClientForm({
  initial,
  submitLabel = 'Enregistrer',
  onSubmit,
}: {
  initial?: Partial<ClientFormValues>
  submitLabel?: string
  onSubmit: (values: ClientFormValues) => Promise<void>
}) {
  const [form, setForm] = useState<ClientFormValues>(toFormValues(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof ClientFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit() {
    if (!form.nom_entreprise.trim()) { setError("Le nom de l'entreprise est requis"); return }
    setSaving(true); setError('')
    try {
      await onSubmit(form)
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
    <div>
      <div style={labelStyle}>Nom de l'entreprise *</div>
      <input style={inputStyle} value={form.nom_entreprise} onChange={set('nom_entreprise')} />

      <div style={labelStyle}>Adresse</div>
      <input style={inputStyle} value={form.adresse} onChange={set('adresse')} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 110 }}>
          <div style={labelStyle}>NPA</div>
          <input style={inputStyle} value={form.npa} onChange={set('npa')} inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Ville</div>
          <input style={inputStyle} value={form.ville} onChange={set('ville')} />
        </div>
        <div style={{ width: 80 }}>
          <div style={labelStyle}>Canton</div>
          <input style={inputStyle} value={form.canton} onChange={set('canton')} />
        </div>
      </div>

      <div style={labelStyle}>Téléphone</div>
      <input style={inputStyle} type="tel" value={form.telephone} onChange={set('telephone')} />

      <div style={labelStyle}>Email</div>
      <input style={inputStyle} type="email" value={form.email} onChange={set('email')} autoCapitalize="off" />

      <div style={labelStyle}>Site web</div>
      <input style={inputStyle} value={form.site_web} onChange={set('site_web')} autoCapitalize="off" />

      <div style={labelStyle}>Notes</div>
      <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={set('notes')} />

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>}

      <button onClick={submit} disabled={saving} className="m-btn primary full" style={{ marginTop: 18, opacity: saving ? 0.7 : 1 }}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {saving ? 'Enregistrement...' : submitLabel}
      </button>
    </div>
  )
}
