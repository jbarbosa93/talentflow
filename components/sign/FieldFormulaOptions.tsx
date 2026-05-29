// TalentFlow Sign — Éditeur des options Formule (calcul auto)
// v2.2.4 — Composant partagé entre WizardEditor (Mode Wizard) et TemplateEditor (Mode Document)
// Garantit la cohérence : mêmes options accessibles depuis les 2 modes.
//
// Affiche : opération (Somme/Moyenne/...), liste des champs sources avec checkboxes,
// nombre de décimales pour le résultat.
'use client'

import type { SignField } from '@/lib/sign/types'

interface Props {
  field: SignField
  /** Liste des fields candidats à devenir source. Filtrer en amont par recipientOrder. */
  allRecipientFields: SignField[]
  onUpdate: (patch: Partial<SignField>) => void
}

const OP_LABELS: Record<NonNullable<SignField['formulaOp']>, string> = {
  sum: 'Somme (a + b + c)',
  sub: 'Soustraction (a - b - c)',
  mul: 'Multiplication (a × b × c)',
  avg: 'Moyenne',
  min: 'Minimum',
  max: 'Maximum',
  worktime: 'Heures travaillées (timbrage HH:MM)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--foreground)',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
}

export default function FieldFormulaOptions({ field, allRecipientFields, onUpdate }: Props) {
  // Inclut checkbox (compte true=1, false=0) en plus de number/text/formula.
  const eligibleFields = allRecipientFields.filter(f =>
    f.id !== field.id &&
    (f.type === 'number' || f.type === 'text' || f.type === 'formula' || f.type === 'checkbox' || f.type === 'time' || f.type === 'pointage')
  )
  const sourceIds = field.formulaSourceIds || []
  const op = field.formulaOp || 'sum'

  const toggleSource = (id: string) => {
    const next = sourceIds.includes(id)
      ? sourceIds.filter(x => x !== id)
      : [...sourceIds, id]
    onUpdate({ formulaSourceIds: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={labelStyle}>Opération</label>
        <select
          value={op}
          onChange={e => onUpdate({ formulaOp: e.target.value as SignField['formulaOp'] })}
          style={inputStyle}
        >
          {(['sum', 'sub', 'mul', 'avg', 'min', 'max', 'worktime'] as const).map(o => (
            <option key={o} value={o}>{OP_LABELS[o]}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>
          Champs sources ({sourceIds.length} sélectionné{sourceIds.length > 1 ? 's' : ''})
        </label>
        {eligibleFields.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', padding: 8 }}>
            Aucun champ Nombre / Texte / Case à cocher disponible. Ajoute d&apos;abord des champs sources.
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            maxHeight: 220, overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 6,
            background: 'var(--card)',
          }}>
            {eligibleFields.map(f => {
              const checked = sourceIds.includes(f.id)
              const orderIdx = sourceIds.indexOf(f.id)
              return (
                <label
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    background: checked ? 'var(--primary-soft)' : 'transparent',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(f.id)}
                    style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  {checked && (
                    <span style={{
                      minWidth: 18, height: 18, padding: '0 4px',
                      borderRadius: 999, background: 'var(--primary)', color: 'var(--primary-foreground)',
                      fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {orderIdx + 1}
                    </span>
                  )}
                  <span style={{ flex: 1, color: 'var(--foreground)' }}>
                    {f.tooltip || f.label || `(${f.type})`}
                  </span>
                  <span className="neo-badge neo-badge-gray" style={{ fontSize: 9 }}>{f.type}</span>
                </label>
              )
            })}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
          Le résultat se met à jour automatiquement quand le candidat tape ses valeurs.
          <br />
          💡 Les <strong>cases à cocher</strong> comptent comme 1 (cochée) ou 0 (non cochée). Avec opération <em>Somme</em>, tu obtiens le <strong>nombre de cases cochées</strong>.
        </div>
      </div>

      <div>
        <label style={labelStyle}>Nombre de décimales</label>
        <select
          value={String(field.formulaDecimals ?? 2)}
          onChange={e => onUpdate({ formulaDecimals: Number(e.target.value) })}
          style={inputStyle}
        >
          <option value="0">0 (entier)</option>
          <option value="1">1 décimale</option>
          <option value="2">2 décimales (défaut)</option>
          <option value="3">3 décimales</option>
        </select>
      </div>
    </div>
  )
}
