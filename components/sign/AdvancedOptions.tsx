// TalentFlow Sign — Options avancées (accordéon, V1)
// v2.2.1
//
// Sections :
//  - Rappels automatiques (toggle + fréquence)
//  - Expiration (preset 7/14/30/personnalisé) + alerte avant expiration
//  - Canal d'envoi (email global / WhatsApp Bientôt)
'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Bell, Clock, MessageCircle, Mail, Inbox } from 'lucide-react'

export interface AdvancedOptionsValue {
  reminderFrequencyDays: number | null  // null/0 = pas de rappels
  expiresInDays: number                 // override TTL token (default 30)
  expiryWarningDays: number | null      // alerte X jours avant
  /** v2.2.5 Phase 4d — 'email' (Resend), 'whatsapp' (Meta Cloud), 'both' (les deux). */
  channel: 'email' | 'whatsapp' | 'both'
  /** v2.2.5 — weekStartDate retiré (déplacé dans le wizard candidat). Champ
   *  conservé optionnel pour compatibilité avec brouillons existants. */
  weekStartDate?: string | null
  /** v2.2.4 — Nom de la société cliente (rapports d'heures, contrats…) injecté
   *  dans les fields type=company du template. Si le template a un champ company
   *  et que cette valeur est vide, l'envoi est bloqué (companyRequired=true). */
  companyName: string | null
  /** v2.9.51 — Email de réception du récap final (override). Par défaut vide
   *  → le récap part sur l'email du créateur de l'enveloppe. Si rempli (ex:
   *  `info@l-agence.ch`), le récap part sur CETTE adresse. Permet aux
   *  secrétaires d'envoyer un template Seb et recevoir le récap sur la BAL
   *  collective. Stocké dans envelope.context_data.recapEmail. */
  recapEmail?: string | null
}

export const DEFAULT_OPTIONS: AdvancedOptionsValue = {
  reminderFrequencyDays: null,
  expiresInDays: 30,
  expiryWarningDays: null,
  channel: 'email',
  companyName: null,
  // v2.10.18 — Email de réception du récap par défaut : info@l-agence.ch
  // (les docs signés finaux arrivent dans la boîte commune, pas que chez le créateur).
  recapEmail: 'info@l-agence.ch',
}

interface Props {
  value: AdvancedOptionsValue
  onChange: (v: AdvancedOptionsValue) => void
  /** v2.2.4 — Si true, le champ "Nom de la société" est mis en avant + obligatoire
   *  (le bouton Envoyer parent vérifiera que companyName est rempli avant submit). */
  companyRequired?: boolean
}

const EXPIRY_PRESETS = [
  { value: 7,  label: '7 jours' },
  { value: 14, label: '14 jours' },
  { value: 30, label: '30 jours (défaut)' },
  { value: -1, label: 'Personnalisé…' },
]

const REMINDER_PRESETS = [
  { value: 2, label: 'Tous les 2 jours' },
  { value: 3, label: 'Tous les 3 jours' },
  { value: 7, label: 'Tous les 7 jours' },
]

const WARNING_PRESETS = [
  { value: 1, label: '1 jour avant' },
  { value: 2, label: '2 jours avant' },
  { value: 3, label: '3 jours avant' },
]

export default function AdvancedOptions({ value, onChange, companyRequired }: Props) {
  // v2.2.4 — Si companyRequired et companyName vide → ouvre le panneau auto pour
  // que l'admin voie immédiatement le champ obligatoire.
  const [open, setOpen] = useState(!!(companyRequired && !value.companyName))
  const isCustomExpiry = ![7, 14, 30].includes(value.expiresInDays)
  const companyMissing = !!companyRequired && !(value.companyName && value.companyName.trim())

  const expiryDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + value.expiresInDays)
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  }, [value.expiresInDays])

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
          Options avancées
        </span>
        <span style={{
          fontSize: 11, color: 'var(--muted)',
          fontWeight: 500,
        }}>
          {value.reminderFrequencyDays
            ? `Rappels tous les ${value.reminderFrequencyDays}j`
            : 'Pas de rappels'}
          {' · '}
          Expire dans {value.expiresInDays}j
        </span>
        <span style={{ flex: 1 }} />
        {open ? <ChevronUp size={16} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted)' }} />}
      </button>

      {open && (
        <div style={{
          padding: '0 18px 18px',
          display: 'flex', flexDirection: 'column', gap: 16,
          borderTop: '1px solid var(--border)',
          paddingTop: 18,
        }}>
          {/* v2.9.51 — Email de réception du récap final (override créateur) */}
          <Section icon={Inbox} title="Email de réception du récap final">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="email"
                value={value.recapEmail || ''}
                onChange={e => onChange({ ...value, recapEmail: e.target.value || null })}
                placeholder="Laisser vide = envoyer à ton adresse (créateur de l'enveloppe)"
                className="neo-input"
                style={{ height: 40, fontSize: 14, border: '1px solid var(--border)', background: 'var(--card)' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                Adresse qui recevra le récap final avec les documents signés. Utile pour les secrétaires :
                envoyer un template Seb pour un candidat à Seb et recevoir le récap sur <code>info@l-agence.ch</code>.
                Le candidat ne voit pas cette adresse.
              </div>
            </div>
          </Section>

          {/* v2.2.4 — Nom de la société cliente (obligatoire si template a un field type=company) */}
          {companyRequired && (
            <Section icon={Bell} title="Société cliente *">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  value={value.companyName || ''}
                  onChange={e => onChange({ ...value, companyName: e.target.value || null })}
                  placeholder="Ex: L-Agence SA, Construction Dupont Sàrl…"
                  className="neo-input"
                  style={{
                    height: 40,
                    fontSize: 14,
                    border: companyMissing ? '1.5px solid #DC2626' : '1px solid var(--border)',
                    background: companyMissing ? 'rgba(220,38,38,0.05)' : 'var(--card)',
                  }}
                />
                <div style={{ fontSize: 11.5, color: companyMissing ? '#DC2626' : 'var(--muted)', lineHeight: 1.5 }}>
                  {companyMissing
                    ? '⚠️ Obligatoire : ce template contient un champ « Société » qui sera pré-rempli avec cette valeur. Sans cela, le candidat verra un tiret.'
                    : 'Ce nom remplira automatiquement les champs de type « Société » dans le rapport.'}
                </div>
              </div>
            </Section>
          )}

          {/* Rappels automatiques */}
          <Section icon={Bell} title="Rappels automatiques">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13, lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={!!value.reminderFrequencyDays}
                onChange={e => onChange({ ...value, reminderFrequencyDays: e.target.checked ? 3 : null })}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
              />
              Activer les rappels automatiques aux destinataires non signés
            </label>
            {value.reminderFrequencyDays !== null && value.reminderFrequencyDays > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {REMINDER_PRESETS.map(p => (
                  <Pill
                    key={p.value}
                    active={value.reminderFrequencyDays === p.value}
                    onClick={() => onChange({ ...value, reminderFrequencyDays: p.value })}
                  >
                    {p.label}
                  </Pill>
                ))}
              </div>
            )}
          </Section>

          {/* Expiration */}
          <Section icon={Clock} title="Expiration">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EXPIRY_PRESETS.map(p => {
                const isActive = p.value === -1 ? isCustomExpiry : value.expiresInDays === p.value
                return (
                  <Pill
                    key={p.value}
                    active={isActive}
                    onClick={() => {
                      if (p.value === -1) onChange({ ...value, expiresInDays: 60 })  // start at 60 for custom
                      else onChange({ ...value, expiresInDays: p.value })
                    }}
                  >
                    {p.label}
                  </Pill>
                )
              })}
            </div>
            {isCustomExpiry && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={1} max={365}
                  value={value.expiresInDays}
                  onChange={e => onChange({ ...value, expiresInDays: Math.max(1, Math.min(365, Number(e.target.value) || 30)) })}
                  style={{
                    width: 90, height: 36, padding: '0 10px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--card)', color: 'var(--foreground)',
                    fontSize: 13, outline: 'none',
                  }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>jour(s)</span>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>
              Expire le : <strong style={{ color: 'var(--foreground)' }}>{expiryDate}</strong>
            </div>

            {/* Alerte avant expiration */}
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13, lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={!!value.expiryWarningDays}
                  onChange={e => onChange({ ...value, expiryWarningDays: e.target.checked ? 2 : null })}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                />
                Envoyer une alerte avant l&apos;expiration
              </label>
              {value.expiryWarningDays !== null && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {WARNING_PRESETS.map(p => (
                    <Pill
                      key={p.value}
                      active={value.expiryWarningDays === p.value}
                      onClick={() => onChange({ ...value, expiryWarningDays: p.value })}
                    >
                      {p.label}
                    </Pill>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* v2.2.5 — weekStartDate retiré : la semaine est saisie par le candidat
              dans son wizard via le champ "Date de début de semaine" du template. */}

          {/* v2.9.61 — Section « Canal d'envoi » retirée : email auto
              (Resend) toujours. WhatsApp via API Meta n'est pas configuré
              côté L-Agence — le canal restait en pratique inutilisable.
              Pour partage manuel WhatsApp, utiliser le bouton « WhatsApp »
              de la page enveloppe (deep link wa.me). */}
        </div>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--muted)', marginBottom: 8,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <Icon size={11} />
        {title}
      </div>
      {children}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 12.5,
        fontWeight: 600,
        border: '1px solid',
        borderColor: active ? 'var(--primary)' : 'var(--border)',
        background: active ? 'var(--primary-soft)' : 'var(--card)',
        color: active ? 'var(--accent-foreground)' : 'var(--text-2, var(--foreground))',
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function ChannelOption({
  active, icon: Icon, label, description, onClick, disabled, badge,
}: {
  active: boolean
  icon: typeof Mail
  label: string
  description: string
  onClick: () => void
  disabled?: boolean
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      style={{
        flex: '1 1 240px',
        padding: '12px 14px',
        border: '1.5px solid',
        borderColor: active ? 'var(--primary)' : 'var(--border)',
        background: active ? 'var(--primary-soft)' : 'var(--card)',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}
    >
      <Icon size={18} style={{ color: active ? 'var(--primary)' : 'var(--muted)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{description}</div>
      </div>
      {badge && (
        <span style={{
          padding: '3px 9px', borderRadius: 999,
          background: 'var(--warning-soft)', color: '#A16207',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          flexShrink: 0,
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
