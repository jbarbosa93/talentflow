// TalentFlow Sign — Options avancées (accordéon, V1)
// v2.2.1
//
// Sections :
//  - Rappels automatiques (toggle + fréquence)
//  - Expiration (preset 7/14/30/personnalisé) + alerte avant expiration
//  - Canal d'envoi (email global / WhatsApp Bientôt)
'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Bell, Clock, MessageCircle, Mail, CalendarDays } from 'lucide-react'

export interface AdvancedOptionsValue {
  reminderFrequencyDays: number | null  // null/0 = pas de rappels
  expiresInDays: number                 // override TTL token (default 30)
  expiryWarningDays: number | null      // alerte X jours avant
  channel: 'email' | 'whatsapp'
  /** v2.2.1 — Date de début de semaine (lundi) pour les rapports d'heures.
   *  Format ISO YYYY-MM-DD. Null = pas applicable. */
  weekStartDate: string | null
}

export const DEFAULT_OPTIONS: AdvancedOptionsValue = {
  reminderFrequencyDays: null,
  expiresInDays: 30,
  expiryWarningDays: null,
  channel: 'email',
  weekStartDate: null,
}

interface Props {
  value: AdvancedOptionsValue
  onChange: (v: AdvancedOptionsValue) => void
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

export default function AdvancedOptions({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const isCustomExpiry = ![7, 14, 30].includes(value.expiresInDays)

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
          {' · '}
          {value.channel === 'email' ? '📧 Email' : '💬 WhatsApp'}
          {value.weekStartDate && ` · 📅 Sem. du ${new Date(value.weekStartDate + 'T00:00:00').toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })}`}
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

          {/* Contexte rapport heures — date début semaine */}
          <Section icon={CalendarDays} title="Date de début de semaine (rapports d'heures)">
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
              Si tu envoies un rapport d&apos;heures, choisis le <strong>lundi de la semaine concernée</strong>.
              Le candidat verra alors les jours avec leur date (ex: « Lundi 04.05.2026 »).
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="date"
                value={value.weekStartDate || ''}
                onChange={e => onChange({ ...value, weekStartDate: e.target.value || null })}
                style={{
                  height: 38,
                  padding: '0 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  colorScheme: 'light dark',
                }}
              />
              {value.weekStartDate && (() => {
                const d = new Date(value.weekStartDate + 'T00:00:00')
                const isMonday = d.getDay() === 1
                const weekEnd = new Date(d)
                weekEnd.setDate(d.getDate() + 6)
                return (
                  <div style={{
                    fontSize: 11.5,
                    color: isMonday ? 'var(--success)' : 'var(--warning)',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    {isMonday
                      ? `✓ Du lundi ${d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })} au dimanche ${weekEnd.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                      : `⚠️ Cette date n'est pas un lundi (jour: ${d.toLocaleDateString('fr-CH', { weekday: 'long' })})`
                    }
                  </div>
                )
              })()}
              {value.weekStartDate && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, weekStartDate: null })}
                  style={{
                    padding: '4px 10px', fontSize: 11,
                    border: '1px solid var(--border)', borderRadius: 6,
                    background: 'transparent', color: 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Effacer
                </button>
              )}
            </div>
          </Section>

          {/* Canal */}
          <Section icon={Mail} title="Canal d'envoi">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ChannelOption
                active={value.channel === 'email'}
                icon={Mail}
                label="Email"
                description="Envoi via Resend (par défaut)"
                onClick={() => onChange({ ...value, channel: 'email' })}
              />
              <ChannelOption
                active={value.channel === 'whatsapp'}
                icon={MessageCircle}
                label="WhatsApp"
                description="Lien wa.me proposé après création"
                badge="Bientôt"
                onClick={() => onChange({ ...value, channel: 'whatsapp' })}
              />
            </div>
            {value.channel === 'whatsapp' && (
              <div style={{
                marginTop: 10,
                padding: '8px 12px',
                background: 'var(--info-soft)',
                borderRadius: 8,
                fontSize: 11.5,
                color: 'var(--info)',
                lineHeight: 1.5,
              }}>
                ℹ️ L&apos;envoi automatique WhatsApp arrive bientôt. En attendant, l&apos;email sera envoyé et tu pourras cliquer sur le bouton <strong>WhatsApp vert</strong> sur la page détail pour ouvrir wa.me avec un lien pré-rempli.
              </div>
            )}
          </Section>
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
