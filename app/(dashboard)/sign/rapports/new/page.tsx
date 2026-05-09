// TalentFlow Rapports — Création d'un lien permanent (Phase 5)
// v2.2.6
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ClipboardList, Loader2, Plus, FileText, Eraser } from 'lucide-react'
import { toast } from 'sonner'
import type { SignTemplate } from '@/lib/sign/types'
import { FirstNameAutocomplete, type CandidateResult } from '@/components/sign/RecipientCard'
import ClientContactAutocomplete from '@/components/report/ClientContactAutocomplete'
import SaveContactDialog from '@/components/report/SaveContactDialog'

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
  // v2.3.8 Bug 2 — Client lié en DB (id) pour rappel visuel + cohérence
  const [clientId, setClientId] = useState<string | null>(null)
  // v2.3.10 Bug 3 — Dialog "Enregistrer ce contact ?" + état saving
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  // v2.3.10 Bug 3 — Mémorise l'email du contact d'origine (au moment du pick)
  // pour détecter si l'user a saisi/édité un email DIFFÉRENT après → propose
  // d'enregistrer. Si email identique au pick → contact déjà en DB, skip dialog.
  const [originalContactEmail, setOriginalContactEmail] = useState<string>('')
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
      // v2.3.10 Bug 2 — Log diagnostic : trace ce que l'autocomplete renvoie pour
      // comprendre les cas où le `candidat_name` final ne contient que le prénom.
      // Si `candidat.nom` est vide ici → le bug est en DB (candidat sans nom).
      // Si `candidat.nom` est rempli mais le state ne reflète pas → bug code.
      console.log('[handleCandidat]', {
        receivedFirstName: firstName,
        candidatId: candidat.id,
        candidatPrenom: candidat.prenom,
        candidatNom: candidat.nom,
        candidatEmail: candidat.email,
        finalNameWillBe: [candidat.prenom || firstName, candidat.nom || ''].filter(Boolean).join(' ').trim(),
      })
      setCandidatId(candidat.id)
      setCandidatPrenom(candidat.prenom || firstName)
      setCandidatNom(candidat.nom || '')
      // v2.3.x Bug 8c — Pré-remplit phone si candidat lié en a un (E.164)
      if (candidat.telephone && !candidatPhone) {
        setCandidatPhone(candidat.telephone)
      }
      // v2.3.8 Bug 1 — Pré-remplit email si candidat lié en a un
      if (candidat.email && !candidatEmail) {
        setCandidatEmail(candidat.email)
      }
    } else {
      // v2.3.8 Bug 5 — Quand l'user tape manuellement après avoir sélectionné un
      // candidat, on délie complètement (id + nom) pour que le rapport reflète
      // la nouvelle saisie et non l'ancien candidat lié.
      setCandidatId(null)
      setCandidatPrenom(firstName)
      setCandidatNom('')
    }
  }

  // v2.3.9 Bug 4 — Reset complet section CANDIDAT (X ou bouton "Tout effacer")
  const clearCandidat = () => {
    setCandidatId(null)
    setCandidatPrenom('')
    setCandidatNom('')
    setCandidatPhone('')
    setCandidatEmail('')
  }

  // v2.3.9 Bug 4 — Reset complet section CLIENT
  const clearClient = () => {
    setClientId(null)
    setClientName('')
    setClientContactName('')
    setClientEmail('')
  }

  const validate = (): string | null => {
    if (!candidatPrenom.trim() && !candidatNom.trim()) return 'Sélectionne un candidat'
    if (!templateId) return 'Choisis un template de rapport'
    if (!title.trim()) return 'Titre requis'
    if (!clientName.trim()) return 'Nom du client requis'
    if (!clientEmail.trim()) return 'Email du client requis'
    return null
  }

  // v2.3.10 Bug 3 — Détecte si l'user devrait être proposé d'enregistrer le contact
  // dans la DB clients :
  //   - Un client EST lié (clientId set via autocomplete)
  //   - L'email contact saisi est DIFFÉRENT de celui d'origine au pick
  //     (ou aucun email d'origine = ligne "entreprise seule" → tout email saisi est nouveau)
  //   - Email valide
  const shouldProposeSaveContact = (): boolean => {
    if (!clientId) return false  // pas de client lié = pas de cible
    const newEmail = clientEmail.trim().toLowerCase()
    if (!newEmail) return false
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return false
    const origEmail = originalContactEmail.trim().toLowerCase()
    return newEmail !== origEmail
  }

  // v2.3.10 Bug 3 — Crée effectivement le lien rapport (extrait de submit pour
  // être réutilisé après le dialog "Enregistrer ce contact ?").
  const createReportLink = async (): Promise<void> => {
    setSubmitting(true)
    try {
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
      setSubmitting(false)
    }
    // Note : on garde submitting=true en cas de succès car le router.push prend la main
  }

  const submit = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    // v2.3.10 Bug 3 — Si l'user a saisi un nouveau contact sur un client existant
    // → propose d'enregistrer en DB avant de créer le lien.
    if (shouldProposeSaveContact()) {
      setSaveDialogOpen(true)
      return
    }
    await createReportLink()
  }

  // v2.3.10 Bug 3 — Handler "Oui, enregistrer" du dialog
  const saveContactAndContinue = async () => {
    if (!clientId) { setSaveDialogOpen(false); await createReportLink(); return }
    setSavingContact(true)
    try {
      // Split nom contact en first/last (ex: "Marie Dupont" → first=Marie last=Dupont)
      const parts = (clientContactName || '').trim().split(/\s+/)
      const firstName = parts[0] || ''
      const lastName = parts.slice(1).join(' ') || ''
      const r = await fetch(`/api/clients/${clientId}/add-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email: clientEmail.trim(),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur ajout contact')
      if (d.alreadyExists) {
        toast.info('Contact déjà présent en DB')
      } else {
        toast.success('Contact ajouté à la fiche client')
      }
    } catch (e: any) {
      // Best-effort : on continue même si l'add-contact échoue (l'user a déjà rempli son flow)
      toast.warning(`Contact non enregistré : ${e.message || 'erreur'}`)
    } finally {
      setSavingContact(false)
      setSaveDialogOpen(false)
    }
    await createReportLink()
  }

  // v2.3.10 Bug 3 — Handler "Non, continuer sans enregistrer"
  const skipSaveAndContinue = async () => {
    setSaveDialogOpen(false)
    await createReportLink()
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
        <Section
          title="Candidat"
          action={
            (candidatId || candidatPrenom || candidatNom || candidatPhone || candidatEmail) ? (
              <button
                type="button"
                onClick={clearCandidat}
                style={clearAllBtnStyle}
                title="Vider tous les champs candidat"
              >
                <Eraser size={11} />
                Tout effacer
              </button>
            ) : null
          }
        >
          <Field label="Candidat (recherche TalentFlow par prénom ou nom)">
            <FirstNameAutocomplete
              value={candidatPrenom}
              isLinked={!!candidatId}
              // v2.3.11 Bug 1 — Affiche prenom + nom dans l'input quand candidat lié
              displayValue={candidatId ? [candidatPrenom, candidatNom].filter(Boolean).join(' ').trim() : undefined}
              onChange={handleCandidat}
              // v2.3.9 Bug 4 — X délie ET vide tous les champs candidat
              onUnlink={clearCandidat}
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
        <Section
          title="Lien & client"
          action={
            (clientId || clientName || clientContactName || clientEmail) ? (
              <button
                type="button"
                onClick={clearClient}
                style={clearAllBtnStyle}
                title="Vider tous les champs client"
              >
                <Eraser size={11} />
                Tout effacer
              </button>
            ) : null
          }
        >
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
          {/* v2.3.8 Bug 2 — Autocomplete client + contacts depuis la DB. Sélectionner
              une ligne pré-remplit clientName + clientContactName + clientEmail. */}
          <Field label="Nom de l'entreprise cliente *" hint="recherche dans la base clients TalentFlow">
            <ClientContactAutocomplete
              value={clientName}
              isLinked={!!clientId}
              placeholder="Tape le nom de l'entreprise…"
              onChange={(name, pick) => {
                setClientName(name)
                if (pick) {
                  setClientId(pick.clientId)
                  // v2.3.9 Bug 5 — pick.contactName/contactEmail peuvent être null
                  // (ligne header "Choisir cette entreprise") → on remplit que si présent
                  if (pick.contactName) setClientContactName(pick.contactName)
                  if (pick.contactEmail) setClientEmail(pick.contactEmail)
                  // v2.3.10 Bug 3 — Mémorise l'email d'origine pour détecter édition
                  setOriginalContactEmail(pick.contactEmail || '')
                } else if (!name.trim()) {
                  // v2.3.9 Bug 4 — Champ vidé manuellement → reset complet section client
                  clearClient()
                  setOriginalContactEmail('')
                } else {
                  // Saisie manuelle libre → délier seulement le client_id
                  setClientId(null)
                }
              }}
              // v2.3.9 Bug 4 — X délie ET vide tous les champs client
              onUnlink={clearClient}
            />
          </Field>
          {clientId && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--success-soft, #D1FAE5)',
              color: 'var(--success, #059669)',
              borderRadius: 8,
              fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ✓ Client lié : <strong>{clientName}</strong>
              {clientContactName && <> · {clientContactName}</>}
            </div>
          )}
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

      {/* v2.3.10 Bug 3 — Dialog confirmation enregistrement contact en DB */}
      <SaveContactDialog
        open={saveDialogOpen}
        clientName={clientName.trim()}
        contactName={clientContactName.trim()}
        contactEmail={clientEmail.trim()}
        saving={savingContact || submitting}
        onSaveAndContinue={saveContactAndContinue}
        onSkipAndContinue={skipSaveAndContinue}
        onCancel={() => { if (!savingContact && !submitting) setSaveDialogOpen(false) }}
      />
    </div>
  )
}

// v2.3.9 Bug 4 — Style bouton "Tout effacer" (header de section)
const clearAllBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--border)',
  borderRadius: 7,
  background: 'var(--card)',
  color: 'var(--muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}

function Section({ title, children, action }: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div style={{
      padding: 18,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, margin: '0 0 14px',
      }}>
        <h2 style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--muted)', margin: 0,
        }}>
          {title}
        </h2>
        {action}
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--muted)' }}>· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
