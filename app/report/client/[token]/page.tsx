// TalentFlow Rapports — Page publique CLIENT (signature)
// v2.2.6 Phase 5 — refonte v2 : réutilise PublicPdfViewer + PublicFieldsLayer
//
// URL : /report/client/{token}
// Le client voit le rapport rempli par le candidat (fields recipientOrder=1 en
// lecture seule grâce à currentRecipientOrder=2 sur PublicFieldsLayer) et signe
// ses propres champs (fields recipientOrder=2). Bouton "Valider et signer" en bas.
'use client'

import { use, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, FileText, Loader2, Lock, ListChecks,
} from 'lucide-react'
import PublicFieldsLayer, { areAllRequiredFieldsFilled } from '@/components/sign/PublicFieldsLayer'
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
  }
  link?: { id: string; title: string; client_name: string | null }
  candidat?: { prenom: string | null; nom: string | null; email: string | null } | null
  template?: { id: string; name: string; documents: SignDocument[] }
  wizard?: { enabled: boolean; steps: WizardStep[] }
  weekLabel?: string
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
          // Pré-remplit avec les valeurs déjà saisies par le candidat (lecture
          // seule pour le client mais il faut les passer pour qu'elles s'affichent).
          if (d.submission?.field_values) setValues(d.submission.field_values)
        }
        else if (d.reason === 'expired') setState('expired')
        else if (d.reason === 'already_signed') setState('signed')
        else if (d.reason === 'cancelled') setState('cancelled')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [token])

  // Mode initial : wizard sur mobile si dispo, sinon document
  useEffect(() => {
    if (state !== 'ok' || !data) return
    const wizardEnabled = data.wizard?.enabled !== false
    const stepsForClient = (data.wizard?.steps || []).filter(s => (s.recipientOrder ?? 1) === 2)
    if (wizardEnabled && stepsForClient.length > 0 && isMobile) setViewMode('wizard')
    else setViewMode('document')
  }, [state, data, isMobile])

  // Le client peut éditer SES champs (recipientOrder=2). Les champs candidat
  // sont en lecture seule grâce à currentRecipientOrder=2 de PublicFieldsLayer.
  const handleFieldChange = (fieldId: string, value: unknown) => {
    setValues(prev => ({ ...prev, [fieldId]: value }))
  }

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
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: '#EAB308',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ClipboardList size={18} style={{ color: '#1C1A14' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: isMobile ? 16 : 18, fontWeight: 400, color: '#1C1A14', letterSpacing: '-0.3px' }}>
            L-AGENCE
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Validation de rapport — {data.weekLabel}
          </div>
        </div>

        {wizardAvailable && (
          <button
            type="button"
            onClick={() => setViewMode(m => m === 'wizard' ? 'document' : 'wizard')}
            style={{
              flexShrink: 0,
              padding: isMobile ? 0 : '7px 12px',
              width: isMobile ? 32 : undefined,
              height: isMobile ? 32 : undefined,
              fontSize: 11.5, fontWeight: 600,
              border: '1px solid #E5E7EB',
              borderRadius: isMobile ? 8 : 999,
              background: '#fff', color: '#6B7280',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              whiteSpace: 'nowrap',
            }}
          >
            {viewMode === 'wizard' ? <FileText size={isMobile ? 14 : 11} /> : <ListChecks size={isMobile ? 14 : 11} />}
            {!isMobile && (viewMode === 'wizard' ? 'Document' : 'Wizard')}
          </button>
        )}
      </header>

      {/* Bandeau info */}
      <div style={{
        flexShrink: 0,
        padding: '10px 16px',
        background: '#FEF3C7',
        borderBottom: '1px solid #FDE68A',
        fontSize: 12.5, color: '#A16207',
        textAlign: 'center', lineHeight: 1.5,
      }}>
        <strong>{candidateFullName || 'Le collaborateur'}</strong> a soumis son rapport pour la <strong>{data.weekLabel}</strong>.
        Vérifiez puis signez en bas.
      </div>

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
              onFinalize={handleFinalize}
              onSwitchToDocumentMode={() => setViewMode('document')}
              token={token}
              previousFieldValues={data.submission.field_values}
              previousSignerLabel={candidateFullName || 'Collaborateur'}
              allDocumentFields={activeDoc?.fields || []}
            />
          </div>
        ) : activeDoc ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <PublicPdfViewer
              key={fileUrl}
              url={fileUrl}
              renderPageOverlay={(pageNum, sizePx) => (
                <PublicFieldsLayer
                  page={pageNum}
                  sizePx={sizePx}
                  fields={activeDoc.fields || []}
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
        ) : null}
      </main>

      {/* Bouton sticky bottom */}
      {viewMode === 'document' && (
        <div style={{
          flexShrink: 0,
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
          background: '#fff',
          borderTop: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
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
            Valider et signer
          </button>
          {!canFinalize && (
            <div style={{
              fontSize: 11, color: '#A16207', textAlign: 'center', marginTop: 2,
            }}>
              ⚠️ Signe le rapport (clique sur le champ Signature dans le document)
            </div>
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
