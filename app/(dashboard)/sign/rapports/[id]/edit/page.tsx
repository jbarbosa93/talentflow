// TalentFlow Rapports — Édition d'un lien permanent (Phase 5 / Feature 7)
// v2.3.x
//
// Permet de modifier les champs d'un lien existant (titre, client, canal, contact, etc.).
// Le candidat lié et le template restent en lecture seule (changer ces données = supprimer
// le lien + en recréer un nouveau, par design).
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ClipboardList, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { ReportLink } from '@/lib/report/types'

export default function EditReportLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [link, setLink] = useState<ReportLink | null>(null)
  const [candidateName, setCandidateName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [candidatNameField, setCandidatNameField] = useState('')
  // v2.3.x Bug 8c
  const [candidatPhoneField, setCandidatPhoneField] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientContactName, setClientContactName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'both'>('email')
  const [status, setStatus] = useState<'active' | 'paused' | 'revoked'>('active')

  useEffect(() => {
    fetch(`/api/admin/reports/${id}`)
      .then(r => r.json())
      .then(d => {
        const l = d.link as ReportLink
        if (!l) { toast.error('Lien introuvable'); return }
        setLink(l)
        setTitle(l.title || '')
        setCandidatNameField(l.candidat_name || '')
        setCandidatPhoneField(l.candidat_phone || '')
        setClientName(l.client_name || '')
        setClientContactName(l.client_contact_name || '')
        setClientEmail(l.client_email || '')
        setClientPhone(l.client_phone || '')
        setChannel(l.delivery_channel)
        setStatus(l.status)

        // Charge le nom candidat (priorité fiche DB si candidat_id présent, sinon candidat_name)
        if (l.candidat_id) {
          fetch(`/api/candidats/${l.candidat_id}`)
            .then(r => r.json())
            .then(cd => {
              const c = cd?.candidat as { prenom?: string; nom?: string } | null
              const name = c ? [c.prenom, c.nom].filter(Boolean).join(' ').trim() : null
              if (name) setCandidateName(name)
            })
            .catch(() => {})
        } else if (l.candidat_name) {
          setCandidateName(l.candidat_name)
        }
      })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Titre requis'); return }
    if (!clientName.trim()) { toast.error('Nom de l\'entreprise cliente requis'); return }
    if ((channel === 'email' || channel === 'both') && !clientEmail.trim()) {
      toast.error('Email client requis pour ce canal'); return
    }
    if ((channel === 'whatsapp' || channel === 'both') && !clientPhone.trim()) {
      toast.error('Téléphone client requis pour ce canal'); return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          candidat_name: candidatNameField.trim() || null,
          candidat_phone: candidatPhoneField.trim() || null,
          client_name: clientName.trim(),
          client_contact_name: clientContactName.trim() || null,
          client_email: clientEmail.trim() || null,
          client_phone: clientPhone.trim() || null,
          delivery_channel: channel,
          status,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Lien mis à jour')
      router.push(`/sign/rapports/${id}`)
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement…</div>
        </div>
      </div>
    )
  }
  if (!link) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-title">Lien introuvable</div>
          <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm" style={{ marginTop: 12 }}>
            <ChevronLeft size={14} />
            Retour aux liens
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/sign/rapports/${id}`} className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Retour au lien
        </Link>
      </div>

      <div className="d-page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--primary-soft)',
            border: '1px solid rgba(245,167,35,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
            color: 'var(--primary, #A16207)',
          }}>
            <ClipboardList size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>Modifier le lien rapport</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Pour changer le candidat ou le template, supprime ce lien et crée-en un nouveau.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
        {/* Section Candidat (lecture seule + nom éditable) */}
        <Section title="Candidat (lecture seule sur la fiche DB)">
          <div style={{
            padding: '10px 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12.5,
            color: 'var(--foreground)',
          }}>
            {link.candidat_id ? (
              <>👤 Candidat lié en DB : <strong>{candidateName || '—'}</strong></>
            ) : (
              <>👤 Saisie manuelle (pas de fiche DB liée)</>
            )}
          </div>
          <Field label="Nom complet du candidat" hint="utilisé pour pré-remplir les champs auto-fill du PDF">
            <input
              type="text"
              value={candidatNameField}
              onChange={e => setCandidatNameField(e.target.value)}
              placeholder="Ex: Joao Barbosa"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
          {/* v2.3.x Bug 8c — Phone candidat (notif WA + deep link wa.me) */}
          <Field label="WhatsApp candidat (optionnel)" hint="utilisé pour notif post-signature + deep link partage">
            <input
              type="tel"
              value={candidatPhoneField}
              onChange={e => setCandidatPhoneField(e.target.value)}
              placeholder="+41 79 123 45 67"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
        </Section>

        {/* Section Lien & client */}
        <Section title="Lien & client">
          <Field label="Titre du lien *">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Rapport Pedro Ferreira — Construction SA"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
          <Field label="Nom de l'entreprise cliente *">
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Construction SA"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
          <Field label="Nom du contact client (optionnel)" hint="utilisé pour la salutation : Bonjour Marie, …">
            <input
              type="text"
              value={clientContactName}
              onChange={e => setClientContactName(e.target.value)}
              placeholder="Ex: Marie Dupont ou Directeur RH"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Email client">
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="contact@client.ch"
                className="neo-input"
                style={{ height: 42 }}
              />
            </Field>
            <Field label="WhatsApp client">
              <input
                type="tel"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                placeholder="+41 79 123 45 67"
                className="neo-input"
                style={{ height: 42 }}
              />
            </Field>
          </div>
        </Section>

        {/* Section canal */}
        <Section title="Canal de notification client">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['email', 'whatsapp', 'both'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                style={{
                  flex: 1, padding: '10px 14px',
                  fontSize: 12.5, fontWeight: 600,
                  border: `1px solid ${channel === c ? 'var(--primary, #EAB308)' : 'var(--border)'}`,
                  background: channel === c ? 'var(--primary-soft)' : 'var(--card)',
                  color: 'var(--foreground)',
                  borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {c === 'email' ? '📧 Email' : c === 'whatsapp' ? '💬 WhatsApp' : '📧 + 💬 Les deux'}
              </button>
            ))}
          </div>
        </Section>

        {/* Section statut */}
        <Section title="Statut du lien">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['active', 'paused', 'revoked'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  flex: 1, padding: '10px 14px',
                  fontSize: 12.5, fontWeight: 600,
                  border: `1px solid ${status === s ? 'var(--primary, #EAB308)' : 'var(--border)'}`,
                  background: status === s ? 'var(--primary-soft)' : 'var(--card)',
                  color: 'var(--foreground)',
                  borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s === 'active' ? '✓ Actif' : s === 'paused' ? '⏸ En pause' : '✕ Révoqué'}
              </button>
            ))}
          </div>
        </Section>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Link
            href={`/sign/rapports/${id}`}
            className="neo-btn-ghost"
          >
            Annuler
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="neo-btn-yellow"
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 16,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--muted)',
        marginBottom: 12,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: 'var(--muted)', marginBottom: 5,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
