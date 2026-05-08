// TalentFlow Rapports — Création d'un lien permanent (Phase 5)
// v2.2.6
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ClipboardList, Loader2, Plus, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { SignTemplate } from '@/lib/sign/types'
import { FirstNameAutocomplete, type CandidateResult } from '@/components/sign/RecipientCard'

export default function NewReportLinkPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<SignTemplate[]>([])
  const [tplLoading, setTplLoading] = useState(true)

  // Form state
  const [candidatId, setCandidatId] = useState<string | null>(null)
  const [candidatPrenom, setCandidatPrenom] = useState('')
  const [candidatNom, setCandidatNom] = useState('')
  // v2.3.x Bug 8c — Phone candidat (E.164, optionnel)
  const [candidatPhone, setCandidatPhone] = useState('')
  // v2.3.7 — Email candidat (optionnel, notif post-signature client)
  const [candidatEmail, setCandidatEmail] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  // v2.3.x Feature 5 — Nom du contact client (texte libre, optionnel)
  const [clientContactName, setClientContactName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Charge les templates de type 'report' uniquement
  useEffect(() => {
    fetch('/api/sign/templates?limit=100')
      .then(r => r.json())
      .then(d => {
        const all = (d.templates || []) as SignTemplate[]
        // Filtre côté client : on n'expose que kind='report' (sécurité côté serveur via POST validation)
        setTemplates(all.filter(t => (t as { kind?: string }).kind === 'report'))
      })
      .catch(() => toast.error('Erreur chargement templates'))
      .finally(() => setTplLoading(false))
  }, [])

  // Auto-titre dès qu'on a candidat + client
  useEffect(() => {
    if (!title.trim() && (candidatPrenom || candidatNom) && clientName) {
      const fullCand = [candidatPrenom, candidatNom].filter(Boolean).join(' ').trim()
      setTitle(`Rapport ${fullCand} — ${clientName}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatPrenom, candidatNom, clientName])

  const handleCandidat = (firstName: string, candidat?: CandidateResult) => {
    if (candidat) {
      setCandidatId(candidat.id)
      setCandidatPrenom(candidat.prenom || firstName)
      setCandidatNom(candidat.nom || '')
      // v2.3.x Bug 8c — Pré-remplit phone si candidat lié en a un (E.164)
      if (candidat.telephone && !candidatPhone) {
        setCandidatPhone(candidat.telephone)
      }
    } else {
      setCandidatId(null)
      setCandidatPrenom(firstName)
    }
  }

  const validate = (): string | null => {
    if (!candidatPrenom.trim() && !candidatNom.trim()) return 'Sélectionne un candidat'
    if (!templateId) return 'Choisis un template de rapport'
    if (!title.trim()) return 'Titre requis'
    if (!clientName.trim()) return 'Nom du client requis'
    if (!clientEmail.trim()) return 'Email du client requis'
    return null
  }

  const submit = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    setSubmitting(true)
    try {
      // v2.3.x — Stocke le nom complet du candidat (source unique pour pré-remplir
      // les fields auto-fill firstname/lastname/fullname du PDF, même si candidat_id IS NULL).
      const candidatNameToSend = [candidatPrenom, candidatNom].filter(Boolean).join(' ').trim() || null

      const r = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidat_id: candidatId,
          candidat_name: candidatNameToSend,
          candidat_phone: candidatPhone.trim() || null,
          candidat_email: candidatEmail.trim() || null,
          template_id: templateId,
          title: title.trim(),
          client_name: clientName.trim(),
          client_contact_name: clientContactName.trim() || null,
          client_email: clientEmail.trim() || null,
          delivery_channel: 'email',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur création')
      toast.success('Lien rapport créé')
      router.push(`/sign/rapports/${d.link.id}`)
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Liens rapports
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
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>Nouveau lien rapport</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Lien permanent pour qu&apos;un candidat soumette son rapport d&apos;heures chaque semaine.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
        {/* Section Candidat */}
        <Section title="Candidat">
          <Field label="Candidat (recherche TalentFlow par prénom ou nom)">
            <FirstNameAutocomplete
              value={candidatPrenom}
              isLinked={!!candidatId}
              onChange={handleCandidat}
              onUnlink={() => { setCandidatId(null) }}
            />
          </Field>
          {/* v2.3.x Bug 8c — Phone candidat (optionnel) pour deep link wa.me */}
          <Field label="WhatsApp candidat (optionnel)" hint="utilisé pour le deep link partage">
            <input
              type="tel"
              value={candidatPhone}
              onChange={e => setCandidatPhone(e.target.value)}
              placeholder="+41 79 123 45 67"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
          {/* v2.3.7 — Email candidat (optionnel) pour notif post-signature client */}
          <Field label="Email candidat (optionnel)" hint="reçoit une copie signée quand le client valide">
            <input
              type="email"
              value={candidatEmail}
              onChange={e => setCandidatEmail(e.target.value)}
              placeholder="candidat@email.ch"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
          {candidatId ? (
            <div style={{
              padding: '8px 12px',
              background: 'var(--success-soft, #D1FAE5)',
              color: 'var(--success, #059669)',
              borderRadius: 8,
              fontSize: 12,
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              ✓ Candidat lié : <strong>{[candidatPrenom, candidatNom].filter(Boolean).join(' ')}</strong>
            </div>
          ) : (
            <div style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              marginTop: 4,
              lineHeight: 1.4,
            }}>
              Tape les premières lettres du prénom OU du nom — la liste suggère les candidats existants en DB.
              Sélectionne pour lier le rapport au bon candidat (les infos email/téléphone seront pré-remplies).
            </div>
          )}
        </Section>

        {/* Section Template */}
        <Section title="Template du rapport">
          {tplLoading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>
              <Loader2 size={16} className="animate-spin" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Chargement…
            </div>
          ) : templates.length === 0 ? (
            <div style={{
              padding: 16,
              background: 'var(--info-soft)',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--info)',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div>
                Aucun template de type <strong>Rapport d&apos;heures</strong> n&apos;existe encore. Crée-en un depuis la page <strong>Templates</strong> (bouton « Nouveau template » → choix « Rapport d&apos;heures »), ou convertis un template existant via le menu actions ⋮.
              </div>
              <Link
                href="/sign/templates"
                className="neo-btn-ghost neo-btn-sm"
                style={{ alignSelf: 'flex-start' }}
              >
                <FileText size={13} />
                Aller aux templates
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 12,
                    background: templateId === t.id ? 'var(--primary-soft)' : 'var(--card)',
                    border: `1px solid ${templateId === t.id ? 'var(--primary, #EAB308)' : 'var(--border)'}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <FileText size={16} style={{ color: 'var(--primary, #A16207)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                      {t.name}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                        {t.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Section Lien */}
        <Section title="Lien & client">
          <Field label="Titre">
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
          {/* v2.3.x Feature 5 — Contact pour la salutation des emails/WA client */}
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
          <Field label="Email client *">
            <input
              type="email"
              value={clientEmail}
              onChange={e => setClientEmail(e.target.value)}
              placeholder="contact@client.ch"
              className="neo-input"
              style={{ height: 42 }}
            />
          </Field>
        </Section>

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
          <Link href="/sign/rapports" className="neo-btn-ghost">Annuler</Link>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !templateId}
            className="neo-btn-yellow"
            style={{ opacity: submitting || !templateId ? 0.6 : 1 }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Créer le lien
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 18,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <h2 style={{
        fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--muted)', margin: '0 0 14px',
      }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--muted)' }}>· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
