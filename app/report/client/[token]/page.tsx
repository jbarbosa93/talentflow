// TalentFlow Rapports — Page publique CLIENT (signature)
// v2.2.6 Phase 5 — refonte v2 : réutilise PublicPdfViewer + PublicFieldsLayer
//
// URL : /report/client/{token}
// Le client voit le rapport rempli par le candidat (fields recipientOrder=1 en
// lecture seule grâce à currentRecipientOrder=2 sur PublicFieldsLayer) et signe
// ses propres champs (fields recipientOrder=2). Bouton "Valider" en bas.
'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, Edit3, FileText, Loader2, Lock, ListChecks, Save, X as XIcon,
} from 'lucide-react'
import PublicFieldsLayer, { areAllRequiredFieldsFilled } from '@/components/sign/PublicFieldsLayer'
import LogoLAgence from '@/components/report/LogoLAgence'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import type { SignDocument, SignField } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

const PublicPdfViewer = dynamic(() => import('@/components/sign/PublicPdfViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 8, color: '#6B7280' }}>
      <Loader2 size={18} className="animate-spin" />
      <span style={{ fontSize: 13 }}>Initialisation…</span>
    </div>
  ),
})
const SignaturePad = dynamic(() => import('@/components/sign/SignaturePad'), { ssr: false })
const SignWizard = dynamic(() => import('@/components/sign/SignWizard'), { ssr: false })

interface VerifyResponse {
  valid: boolean
  reason?: 'not_found' | 'already_signed' | 'expired' | 'cancelled' | 'not_ready' | 'no_template' | 'link_not_found'
  submission?: {
    id: string
    week_start: string
    week_end: string
    field_values: Record<string, unknown>
    candidate_signature_data_url: string | null
    candidate_signed_at: string | null
    status: string
    client_token_expires_at: string | null
    /** v2.4.0 — Note libre du candidat (max 300 chars). */
    notes_candidat?: string | null
    /** v2.4.0 — Note libre du client (persistée via PATCH update-fields). */
    notes_client?: string | null
  }
  link?: { id: string; title: string; client_name: string | null; client_contact_name?: string | null }
  candidat?: { prenom: string | null; nom: string | null; email: string | null } | null
  template?: { id: string; name: string; documents: SignDocument[] }
  wizard?: { enabled: boolean; steps: WizardStep[] }
  /** v2.3.x Bug 4 — Auto-fill candidat résolu côté serveur (firstname/lastname/dates jours/etc).
   *  À merger comme valeurs initiales pour que les fields candidat read-only s'affichent. */
  previousFieldValues?: Record<string, unknown>
  weekLabel?: string
  /** v2.5.1 — Numéro de semaine ISO (ex: 19 pour la semaine du 4-10 mai 2026). */
  weekNumber?: number
}

const COMPANY = 'L-Agence SA'

export default function PublicClientReportPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [state, setState] = useState<'loading' | 'invalid' | 'expired' | 'signed' | 'cancelled' | 'ok' | 'error'>('loading')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [viewMode, setViewMode] = useState<'wizard' | 'document'>('document')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  // v2.4.0 — Note libre client (saved via PATCH update-fields juste avant la signature finale)
  const [notesClient, setNotesClient] = useState<string>('')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetch(`/api/reports/client/${token}`)
      .then(r => r.json())
      .then((d: VerifyResponse) => {
        setData(d)
        if (d.valid) {
          setState('ok')
          // v2.3.x Bug 4 — Merge previousFieldValues (auto-fill candidat résolu serveur :
          // firstname/lastname/fullname/email/company + dates jour/datesigned) ⊕
          // submission.field_values (saisies candidat). Tout est exposé en read-only via
          // PublicFieldsLayer grâce à currentRecipientOrder=2.
          const merged: Record<string, unknown> = {
            ...(d.previousFieldValues || {}),
            ...(d.submission?.field_values || {}),
          }
          if (Object.keys(merged).length > 0) setValues(merged)
          // v2.4.0 — Pré-remplir si une note client a déjà été saisie (reprise)
          if (typeof d.submission?.notes_client === 'string') {
            setNotesClient(d.submission.notes_client)
          }
        }
        else if (d.reason === 'expired') setState('expired')
        else if (d.reason === 'already_signed') setState('signed')
        else if (d.reason === 'cancelled') setState('cancelled')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [token])

  // v2.5.1 — Côté client : TOUJOURS en mode document (preview + signature).
  // Plus de bascule vers le wizard — le client n'a pas à remplir étape par étape,
  // il valide juste le rapport déjà rempli par le candidat.
  useEffect(() => {
    setViewMode('document')
  }, [state, data, isMobile])

  // Le client peut éditer SES champs (recipientOrder=2). Les champs candidat
  // sont en lecture seule grâce à currentRecipientOrder=2 de PublicFieldsLayer.
  const handleFieldChange = (fieldId: string, value: unknown) => {
    setValues(prev => ({ ...prev, [fieldId]: value }))
    if (editMode) setEditValues(prev => ({ ...prev, [fieldId]: value }))
  }

  const handleEnterEditMode = () => {
    setEditValues({})
    setEditMode(true)
  }

  const handleCancelEdit = () => {
    // Revert les valeurs modifiées (recharge depuis data initiale)
    const merged: Record<string, unknown> = {
      ...(data?.previousFieldValues || {}),
      ...(data?.submission?.field_values || {}),
    }
    setValues(merged)
    setEditValues({})
    setEditMode(false)
  }

  const handleSaveEdit = useCallback(async () => {
    if (Object.keys(editValues).length === 0) {
      setEditMode(false)
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/reports/client/${token}/update-fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldValues: editValues }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur sauvegarde')
      setEditMode(false)
      setEditValues({})
      toast.success('Données sauvegardées')
    } catch (e: any) {
      toast.error(e.message || 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [token, editValues])

  const handleAdoptSignature = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl)
    setSignaturePadOpen(false)
    toast.success('Signature adoptée — cliquez sur Valider')
  }

  const handleFinalize = async () => {
    if (!signatureDataUrl) {
      toast.error('Signe le rapport avant de finaliser (clique sur le champ Signature dans le document)')
      setSignaturePadOpen(true)
      return
    }
    if (!confirm('Valider et signer ce rapport ? Cette action est définitive.')) return
    setSubmitting(true)
    try {
      // v2.4.0 — Persiste notes_client juste avant signature si renseignée
      if (notesClient.trim()) {
        try {
          await fetch(`/api/reports/client/${token}/update-fields`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes_client: notesClient.trim().slice(0, 300) }),
          })
        } catch { /* non-bloquant — la signature continue */ }
      }
      const r = await fetch(`/api/reports/client/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data_url: signatureDataUrl }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur signature')
      setCompleted(true)
      toast.success('Rapport signé — copie envoyée par email')
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── États d'erreur ─────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <CenteredCard>
        <Loader2 size={28} className="animate-spin" style={{ color: '#EAB308' }} />
        <p style={{ ...textStyle, marginTop: 16 }}>Chargement du rapport…</p>
      </CenteredCard>
    )
  }
  if (state === 'invalid' || state === 'error') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><AlertTriangle size={28} /></div>
        <h1 style={titleStyle}>Lien invalide</h1>
        <p style={textStyle}>Ce lien n&apos;existe pas. Contactez {COMPANY}.</p>
      </CenteredCard>
    )
  }
  if (state === 'expired') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEF3C7', '#A16207')}><Clock size={28} /></div>
        <h1 style={titleStyle}>Lien expiré</h1>
        <p style={textStyle}>Ce lien de signature a expiré. Demandez un nouveau lien à {COMPANY}.</p>
      </CenteredCard>
    )
  }
  if (state === 'signed') {
    return (
      <CenteredCard>
        <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={28} /></div>
        <h1 style={titleStyle}>Rapport déjà signé</h1>
        <p style={textStyle}>Ce rapport a déjà été signé. Une copie a été envoyée par email.</p>
      </CenteredCard>
    )
  }
  if (state === 'cancelled') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><Lock size={28} /></div>
        <h1 style={titleStyle}>Rapport annulé</h1>
        <p style={textStyle}>Ce rapport a été annulé. Contactez {COMPANY}.</p>
      </CenteredCard>
    )
  }

  if (!data?.submission || !data.template || !data.link) return null

  // ─── Confirmation finale ───
  if (completed) {
    return (
      <CenteredCard>
        <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={28} /></div>
        <h1 style={titleStyle}>Rapport signé</h1>
        <p style={textStyle}>
          Merci ! Le rapport est maintenant signé par les deux parties.<br />
          Une copie vous a été envoyée par email.
        </p>
      </CenteredCard>
    )
  }

  // ─── État OK ────────────────────────────────────────────────────────
  const activeDoc = data.template.documents[0]
  const candidateFullName = data.candidat
    ? [data.candidat.prenom, data.candidat.nom].filter(Boolean).join(' ').trim()
    : ''
  const clientName = data.link.client_name || 'Client'
  const allFields: SignField[] = activeDoc?.fields || []
  const clientFields = allFields.filter(f => (f.recipientOrder ?? 1) === 2)

  // Types de champs candidat que le client peut modifier en mode édition
  const CLIENT_EDITABLE_TYPES: SignField['type'][] = ['number', 'text', 'checkbox']

  // En mode édition : les champs number/text/checkbox du candidat (recipientOrder=1)
  // sont "promus" à recipientOrder=2 pour devenir interactifs via PublicFieldsLayer.
  const displayFields: SignField[] = editMode
    ? allFields.map(f => {
        if ((f.recipientOrder ?? 1) === 1 && CLIENT_EDITABLE_TYPES.includes(f.type)) {
          return { ...f, recipientOrder: 2 }
        }
        return f
      })
    : allFields
  const recipientPalette = RECIPIENT_COLORS[1]  // Client = rôle 2 = vert
  const wizardStepsForClient = (data.wizard?.steps || []).filter(s => (s.recipientOrder ?? 1) === 2)
  const wizardAvailable = (data.wizard?.enabled !== false) && wizardStepsForClient.length > 0

  // Auto-fill (le client n'a généralement pas d'auto-fill complexe — utilise le clientName + email)
  const today = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const clientParts = clientName.trim().split(/\s+/)
  const autoFill = {
    firstName: clientParts[0] || '',
    lastName:  clientParts.slice(1).join(' ') || '',
    fullName:  clientName,
    email:     '',
    today,
    companyName: clientName,
    title: '',
    telephone: '',
    dateNaissance: '',
    localisation: '',
  }

  const canFinalize = !!signatureDataUrl
    && areAllRequiredFieldsFilled(clientFields, values, signatureDataUrl, autoFill)

  const fileUrl = activeDoc
    ? `/api/reports/client/${token}/document?path=${encodeURIComponent(activeDoc.storage_path)}`
    : ''

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAFAF7',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      paddingTop: 'env(safe-area-inset-top, 0)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* SignaturePad */}
      <SignaturePad
        open={signaturePadOpen}
        defaultName={clientName}
        onClose={() => setSignaturePadOpen(false)}
        onAdopt={handleAdoptSignature}
      />

      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        {/* v2.4.7 — Logo officiel (au lieu de l'icône jaune + texte L-AGENCE approximatif) */}
        <LogoLAgence height={isMobile ? 30 : 34} color="dark" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.weekNumber ? <strong style={{ color: '#1C1A14' }}>Semaine {data.weekNumber} · </strong> : null}
            {data.weekLabel}
          </div>
        </div>

        {/* v2.5.1 — Bouton Wizard côté client retiré. Le client valide en mode
            Document uniquement (preview PDF + signature) — pas besoin d'étape par étape. */}

        {/* v2.3.14 — Indicateur + bouton "Valider" COMPACT en haut DESKTOP.
            Remplace le footer sticky bottom (masqué sur desktop). Disabled tant
            que la signature ou un champ requis manque. */}
        {!isMobile && (
          <>
            {!canFinalize && (
              <span style={{
                fontSize: 11.5, color: '#A16207', whiteSpace: 'nowrap',
                fontWeight: 600,
              }}>
                ⚠️ Champs requis manquants
              </span>
            )}
            <button
              type="button"
              onClick={handleFinalize}
              disabled={submitting || !canFinalize}
              title={!canFinalize ? 'Signe le rapport avant de valider' : 'Valider le rapport'}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                fontSize: 13, fontWeight: 700,
                border: '1px solid #1C1A14', borderRadius: 8,
                background: '#EAB308', color: '#1C1A14',
                cursor: submitting || !canFinalize ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting || !canFinalize ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Valider
            </button>
          </>
        )}
      </header>

      {/* Bandeau info / mode édition */}
      {editMode ? (
        <div style={{
          flexShrink: 0,
          padding: '10px 16px',
          background: '#FEF3C7',
          borderBottom: '1px solid #FDE68A',
          fontSize: 12.5, color: '#92400E',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <Edit3 size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>Vous modifiez les données du rapport.</strong>{' '}
            Les modifications seront incluses dans le PDF final.
          </span>
          <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleCancelEdit}
              style={{
                padding: '5px 10px', fontSize: 12, fontWeight: 600,
                border: '1px solid #D97706', borderRadius: 7,
                background: 'transparent', color: '#92400E',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <XIcon size={11} /> Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving}
              style={{
                padding: '5px 10px', fontSize: 12, fontWeight: 700,
                border: '1px solid #1C1A14', borderRadius: 7,
                background: '#EAB308', color: '#1C1A14',
                cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              Sauvegarder
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          flexShrink: 0,
          padding: '10px 16px',
          background: '#FEF3C7',
          borderBottom: '1px solid #FDE68A',
          fontSize: 12.5, color: '#A16207',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ flex: 1, lineHeight: 1.5 }}>
            <strong>{candidateFullName || 'Le collaborateur'}</strong> a soumis son rapport pour la <strong>{data.weekLabel}</strong>.
            Vérifiez puis signez en bas.
          </span>
          <button
            type="button"
            onClick={handleEnterEditMode}
            style={{
              flexShrink: 0,
              padding: '4px 10px', fontSize: 11.5, fontWeight: 600,
              border: '1px solid #D97706', borderRadius: 7,
              background: 'transparent', color: '#92400E',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Edit3 size={11} /> Modifier les données
          </button>
        </div>
      )}

      {/* v2.4.0 — Bandeau note candidat (si présente) */}
      {data.submission?.notes_candidat && data.submission.notes_candidat.trim() && (
        <div style={{
          flexShrink: 0,
          margin: '12px 16px 0',
          padding: '12px 14px',
          background: '#FEF3C7',
          borderLeft: '3px solid #EAB308',
          borderRadius: '0 8px 8px 0',
          fontSize: 13, color: '#92400E', lineHeight: 1.55,
        }}>
          <div style={{ fontWeight: 700, color: '#78350F', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            📝 Note du collaborateur
          </div>
          <div>{data.submission.notes_candidat}</div>
        </div>
      )}

      {/* Vue principale */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'wizard' && wizardAvailable ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <SignWizard
              steps={wizardStepsForClient}
              documents={data.template.documents}
              fieldValues={values}
              onValueChange={handleFieldChange}
              signatureDataUrl={signatureDataUrl}
              onRequestSignature={() => setSignaturePadOpen(true)}
              autoFill={autoFill}
              recipientName={clientName}
              envelopeTitle={data.link.title}
              completed={false}
              finalizing={submitting}
              // v2.3.3 Bug 4 — Pas de récapitulatif côté client (inutile, alourdit le flow)
              hideRecap
              onFinalize={handleFinalize}
              onSwitchToDocumentMode={() => setViewMode('document')}
              token={token}
              previousFieldValues={{ ...(data.previousFieldValues || {}), ...(data.submission.field_values || {}) }}
              previousSignerLabel={candidateFullName || 'Collaborateur'}
              allDocumentFields={activeDoc?.fields || []}
            />
          </div>
        ) : activeDoc ? (
          // v2.3.x — Pattern aligné sur Sign : pas de flex column wrapper interne (décale les
          // coords des fields). Desktop : card centrée max 1100. Mobile : pleine largeur.
          isMobile ? (
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <PublicPdfViewer
                key={fileUrl}
                url={fileUrl}
                renderPageOverlay={(pageNum, sizePx) => (
                  <PublicFieldsLayer
                    page={pageNum}
                    sizePx={sizePx}
                    fields={displayFields}
                    values={values}
                    onValueChange={handleFieldChange}
                    signatureDataUrl={signatureDataUrl}
                    onRequestSignature={() => setSignaturePadOpen(true)}
                    recipientColor={recipientPalette}
                    autoFill={autoFill}
                    currentRecipientOrder={2}
                  />
                )}
              />
            </div>
          ) : (
            <div style={{
              flex: 1, overflow: 'hidden', position: 'relative',
              padding: '16px 24px 24px',
              background: '#F3F4F6',
            }}>
              <div style={{
                width: '100%', height: '100%',
                maxWidth: 1100,
                margin: '0 auto',
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                border: '1px solid #E5E7EB',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <PublicPdfViewer
                  key={fileUrl}
                  url={fileUrl}
                  renderPageOverlay={(pageNum, sizePx) => (
                    <PublicFieldsLayer
                      page={pageNum}
                      sizePx={sizePx}
                      fields={displayFields}
                      values={values}
                      onValueChange={handleFieldChange}
                      signatureDataUrl={signatureDataUrl}
                      onRequestSignature={() => setSignaturePadOpen(true)}
                      recipientColor={recipientPalette}
                      autoFill={autoFill}
                      currentRecipientOrder={2}
                    />
                  )}
                />
              </div>
            </div>
          )
        ) : null}
      </main>

      {/* v2.4.0 — Panneau finalisation : textarea note client + bouton Valider.
          Visible mobile ET desktop pour héberger la textarea note client (qui
          ne tient pas dans le header compact desktop). */}
      {viewMode === 'document' && (
        <div style={{
          flexShrink: 0,
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
          background: '#fff',
          borderTop: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <details style={{
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            background: '#FAFAF7',
          }}>
            <summary style={{
              padding: '8px 12px',
              fontSize: 12.5, fontWeight: 600,
              color: '#1C1A14', cursor: 'pointer', userSelect: 'none',
            }}>
              📝 Ajouter une note (optionnel) {notesClient ? `(${notesClient.length}/300)` : ''}
            </summary>
            <div style={{ padding: '4px 12px 12px' }}>
              <textarea
                value={notesClient}
                onChange={(e) => setNotesClient(e.target.value.slice(0, 300))}
                placeholder="Commentaire ou correction…"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#1C1A14',
                  resize: 'vertical',
                  minHeight: 60,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
                {notesClient.length}/300
              </div>
            </div>
          </details>

          {isMobile && (
            <>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={submitting || !canFinalize}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%',
                  padding: '14px 18px',
                  fontSize: 15, fontWeight: 700,
                  border: '1px solid #1C1A14', borderRadius: 10,
                  background: '#EAB308', color: '#1C1A14',
                  cursor: submitting || !canFinalize ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: submitting || !canFinalize ? 0.5 : 1,
                  minHeight: 52,
                }}
              >
                {submitting
                  ? <Loader2 size={16} className="animate-spin" />
                  : <CheckCircle2 size={16} />}
                Valider
              </button>
              {!canFinalize && (
                <div style={{
                  fontSize: 11, color: '#A16207', textAlign: 'center', marginTop: 2,
                }}>
                  ⚠️ Signe le rapport (clique sur le champ Signature dans le document)
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers UI ───────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: '#FAFAF7',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 460, width: '100%', padding: 32,
        background: '#fff', border: '1px solid #E5E7EB',
        borderRadius: 16, textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
      }}>
        {children}
      </div>
    </div>
  )
}

const iconWrap = (bg: string, color: string): React.CSSProperties => ({
  width: 56, height: 56, borderRadius: 14,
  background: bg, color,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 16,
})

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 22, fontWeight: 400, color: '#1C1A14',
  letterSpacing: '-0.3px', lineHeight: 1.2, marginBottom: 8,
}

const textStyle: React.CSSProperties = {
  fontSize: 13.5, color: '#6B7280', lineHeight: 1.55, margin: 0,
}
