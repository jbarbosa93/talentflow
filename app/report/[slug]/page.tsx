// TalentFlow Rapports — Page publique candidat (lien permanent)
// v2.2.6 Phase 5 — refonte v2 : réutilise PublicPdfViewer + SignWizard de Sign
//
// URL : /report/{slug}
// Lien permanent : pas de token, pas d'expiration. Le candidat ouvre, choisit
// la semaine (sélecteur dédié au-dessus du viewer), remplit les champs sur le
// PDF (mode Document) ou via le formulaire pas-à-pas (mode Wizard), signe via
// SignaturePad (champs signature placés sur le PDF par l'admin), soumet.
'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, FileText, ListChecks, Loader2, Lock,
  QrCode, Save, Send,
} from 'lucide-react'
import WeekSelector from '@/components/report/WeekSelector'
import PublicFieldsLayer, { areAllRequiredFieldsFilled } from '@/components/sign/PublicFieldsLayer'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import type { SignDocument, SignField } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
import type { ReportSubmissionStatus } from '@/lib/report/types'
import {
  getCurrentWeekStart, isoDate, getWeekDates, parseIsoDate,
} from '@/lib/report/week-helpers'
import {
  getDayOffsetFromSection, dateForDayOfWeek,
} from '@/lib/sign/field-helpers'

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
const QRCodeModal = dynamic(() => import('@/components/report/QRCodeModal'), { ssr: false })

interface VerifyResponse {
  valid: boolean
  reason?: string
  link?: { id: string; slug: string; title: string; client_name: string | null; delivery_channel: string }
  candidat?: { prenom: string | null; nom: string | null; email: string | null } | null
  template?: { id: string; name: string; documents: SignDocument[] }
  wizard?: { enabled: boolean; steps: WizardStep[] }
  submissions?: Array<{
    id: string
    week_start: string
    week_end: string
    status: ReportSubmissionStatus
    candidate_signed_at: string | null
    client_signed_at: string | null
  }>
}

const COMPANY = 'L-Agence SA'
const AUTOSAVE_INTERVAL_MS = 30000  // 30s

export default function PublicReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [state, setState] = useState<'loading' | 'invalid' | 'paused' | 'revoked' | 'ok' | 'error'>('loading')

  const [weekStart, setWeekStart] = useState<string>(() => isoDate(getCurrentWeekStart()))
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)

  const [submitting, setSubmitting] = useState<'remote' | 'present' | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrCodeExpires, setQrCodeExpires] = useState<Date | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Mode Wizard / Document : auto-switch mobile → wizard, desktop → document
  const [isMobile, setIsMobile] = useState(false)
  const [viewMode, setViewMode] = useState<'wizard' | 'document'>('document')
  const [activeDocIdx] = useState(0)
  const [scrollToPage, setScrollToPage] = useState<number | undefined>(undefined)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  // ─── Fetch initial ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/reports/${slug}`)
      .then(r => r.json())
      .then((d: VerifyResponse) => {
        setData(d)
        if (d.valid) setState('ok')
        else if (d.reason === 'paused') setState('paused')
        else if (d.reason === 'revoked') setState('revoked')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [slug])

  // Mode initial : wizard sur mobile si dispo, sinon document
  useEffect(() => {
    if (state !== 'ok' || !data) return
    const wizardEnabled = data.wizard?.enabled !== false
    const stepsForCandidat = (data.wizard?.steps || []).filter(s => (s.recipientOrder ?? 1) === 1)
    if (wizardEnabled && stepsForCandidat.length > 0 && isMobile) setViewMode('wizard')
    else setViewMode('document')
  }, [state, data, isMobile])

  // ─── Find existing submission for selected week ─────────────────────
  const submissionForWeek = useMemo(
    () => data?.submissions?.find(s => s.week_start === weekStart),
    [data, weekStart],
  )
  const isLockedWeek = !!submissionForWeek
    && submissionForWeek.status !== 'draft'
    && submissionForWeek.status !== 'cancelled'

  // Reset values + auto-fill quand la semaine change (pré-fill dates par jour)
  useEffect(() => {
    if (state !== 'ok' || !data?.template) return

    const buildAutoFillForWeek = (): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      const fields = (data.template?.documents[0]?.fields || []) as SignField[]
      for (const f of fields) {
        if (f.type !== 'date') continue
        const dayOffset = getDayOffsetFromSection(f.wizardSection)
        if (dayOffset !== null) {
          const dayDate = dateForDayOfWeek(weekStart, dayOffset)
          if (dayDate) out[f.id] = dayDate
        }
      }
      return out
    }

    let restoredFromLocal = false
    try {
      const raw = localStorage.getItem(`tf_report_draft_${slug}_${weekStart}`)
      if (raw) {
        const parsed = JSON.parse(raw) as { values: Record<string, unknown>; savedAt?: number }
        if (parsed?.values) {
          // Local backup PRIORITAIRE sur auto-fill (l'user pourrait avoir overridé)
          setValues({ ...buildAutoFillForWeek(), ...parsed.values })
          setSavedAt(parsed.savedAt ? new Date(parsed.savedAt) : null)
          restoredFromLocal = true
        }
      }
    } catch { /* silent */ }

    if (!restoredFromLocal) {
      fetch(`/api/reports/${slug}/save-draft?week=${weekStart}`)
        .then(r => r.json())
        .then(d => {
          if (d.submission?.field_values) {
            setValues({ ...buildAutoFillForWeek(), ...d.submission.field_values })
          } else {
            setValues(buildAutoFillForWeek())
          }
        })
        .catch(() => setValues(buildAutoFillForWeek()))
    }
    // Reset signature pour la nouvelle semaine
    setSignatureDataUrl(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, state, slug])

  // ─── Auto-save (localStorage immédiat + DB toutes les 30s) ──────────
  const lastSavedHashRef = useRef<string>('')

  const saveToLocalStorage = useCallback((vals: Record<string, unknown>) => {
    try {
      localStorage.setItem(
        `tf_report_draft_${slug}_${weekStart}`,
        JSON.stringify({ values: vals, savedAt: Date.now() }),
      )
    } catch { /* quota */ }
  }, [slug, weekStart])

  const syncToDB = useCallback(async (vals: Record<string, unknown>) => {
    if (isLockedWeek) return
    try {
      const r = await fetch(`/api/reports/${slug}/save-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: weekStart,
          week_end: weekDates.end,
          field_values: vals,
        }),
      })
      if (r.ok) setSavedAt(new Date())
    } catch (e) {
      console.warn('[report] save-draft failed', e)
    }
  }, [slug, weekStart, weekDates.end, isLockedWeek])

  useEffect(() => {
    if (state !== 'ok' || isLockedWeek) return
    const interval = setInterval(() => {
      const hash = JSON.stringify(values)
      if (hash !== lastSavedHashRef.current && Object.keys(values).length > 0) {
        lastSavedHashRef.current = hash
        syncToDB(values)
      }
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [state, values, syncToDB, isLockedWeek])

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setValues(prev => {
      const next = { ...prev, [fieldId]: value }
      saveToLocalStorage(next)
      return next
    })
  }, [saveToLocalStorage])

  // ─── Signature ───
  const handleSignatureAdopted = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl)
    setSignaturePadOpen(false)
    toast.success('Signature adoptée — appliquée à tous les champs signature')
  }

  // ─── Submit ───
  const handleSubmit = async (mode: 'remote' | 'present') => {
    if (!signatureDataUrl) {
      toast.error('Signe le rapport avant de l\'envoyer (clique sur le champ Signature dans le document)')
      setSignaturePadOpen(true)
      return
    }
    setSubmitting(mode)
    try {
      const r = await fetch(`/api/reports/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: weekStart,
          field_values: values,
          signature_data_url: signatureDataUrl,
          mode,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur soumission')
      // Cleanup localStorage
      try { localStorage.removeItem(`tf_report_draft_${slug}_${weekStart}`) } catch {}
      if (mode === 'remote') {
        toast.success('Rapport envoyé au client')
      } else {
        const url = `${window.location.origin}/report/client/${d.client_token}`
        setQrCodeUrl(url)
        setQrCodeExpires(new Date(d.client_token_expires_at))
      }
      // Refresh submissions
      fetch(`/api/reports/${slug}`)
        .then(r => r.json())
        .then((nd: VerifyResponse) => { if (nd.valid) setData(nd) })
        .catch(() => {})
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSubmitting(null)
    }
  }

  // ─── États d'erreur ─────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <CenteredCard>
        <Loader2 size={28} className="animate-spin" style={{ color: '#EAB308' }} />
        <p style={{ ...textStyle, marginTop: 16 }}>Chargement du lien…</p>
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
  if (state === 'paused') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEF3C7', '#A16207')}><Lock size={28} /></div>
        <h1 style={titleStyle}>Lien en pause</h1>
        <p style={textStyle}>Ce lien est temporairement désactivé. Contactez {COMPANY}.</p>
      </CenteredCard>
    )
  }
  if (state === 'revoked') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><Lock size={28} /></div>
        <h1 style={titleStyle}>Lien révoqué</h1>
        <p style={textStyle}>Ce lien n&apos;est plus actif. Contactez {COMPANY}.</p>
      </CenteredCard>
    )
  }

  if (!data?.template || !data?.link) return null

  // ─── État OK ────────────────────────────────────────────────────────
  const activeDoc = data.template.documents[activeDocIdx]
  const candidateFullName = data.candidat
    ? [data.candidat.prenom, data.candidat.nom].filter(Boolean).join(' ').trim()
    : ''
  const recipientPalette = RECIPIENT_COLORS[0]  // Candidat = rôle 1 = bleu

  // Auto-fill (passé à PublicFieldsLayer + SignWizard)
  const nameParts = candidateFullName.trim().split(/\s+/)
  const today = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const autoFill = {
    firstName: data.candidat?.prenom || nameParts[0] || '',
    lastName:  data.candidat?.nom || nameParts.slice(1).join(' ') || '',
    fullName:  candidateFullName,
    email:     data.candidat?.email || '',
    today,
    companyName: data.link.client_name || '',
    title: '',
    telephone: '',
    dateNaissance: '',
    localisation: '',
  }

  const candidatFields: SignField[] = (activeDoc?.fields || []).filter(f => (f.recipientOrder ?? 1) === 1)
  const wizardStepsForCandidat = (data.wizard?.steps || []).filter(s => (s.recipientOrder ?? 1) === 1)
  const wizardAvailable = (data.wizard?.enabled !== false) && wizardStepsForCandidat.length > 0

  const canFinalize = !!signatureDataUrl
    && areAllRequiredFieldsFilled(candidatFields, values, signatureDataUrl, autoFill)

  const fileUrl = activeDoc
    ? `/api/reports/${slug}/document?path=${encodeURIComponent(activeDoc.storage_path)}`
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
        defaultName={candidateFullName}
        onClose={() => setSignaturePadOpen(false)}
        onAdopt={handleSignatureAdopted}
      />

      {/* QR code modal */}
      {qrCodeUrl && qrCodeExpires && (
        <QRCodeModal
          open
          url={qrCodeUrl}
          expiresAt={qrCodeExpires}
          onClose={() => { setQrCodeUrl(null); setQrCodeExpires(null) }}
        />
      )}

      {/* ─── Header L-Agence — desktop : topbar riche, mobile : compact ─── */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        padding: isMobile ? '12px 14px' : '14px 24px',
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
        flexShrink: 0,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        {/* Bloc identité L-Agence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
          <div style={{
            width: isMobile ? 36 : 42, height: isMobile ? 36 : 42, borderRadius: 10,
            background: '#EAB308',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <ClipboardList size={isMobile ? 18 : 20} style={{ color: '#1C1A14' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'Georgia, serif',
              fontSize: isMobile ? 16 : 19, fontWeight: 400,
              color: '#1C1A14', letterSpacing: '-0.3px',
              lineHeight: 1.1,
            }}>
              L-AGENCE
            </div>
            <div style={{
              fontSize: isMobile ? 10.5 : 11.5, color: '#6B7280', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: isMobile ? 200 : 360,
            }}>
              Rapport hebdomadaire {candidateFullName ? `— ${candidateFullName}` : ''}
            </div>
          </div>
        </div>

        {/* Desktop : WeekSelector compact au centre */}
        {!isMobile && (
          <div style={{ flex: 1, minWidth: 0, maxWidth: 360, marginLeft: 24 }}>
            <WeekSelector
              value={weekStart}
              onChange={setWeekStart}
              submissions={(data.submissions || []).map(s => ({ weekStart: s.week_start, status: s.status }))}
            />
          </div>
        )}

        <span style={{ flex: 1 }} />

        {/* Indicateur auto-save (desktop seulement, dans le header) */}
        {!isLockedWeek && !isMobile && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: '#9CA3AF',
            whiteSpace: 'nowrap',
          }}>
            <Save size={11} />
            {savedAt
              ? `Sauvegardé ${savedAt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`
              : 'Auto-save'}
          </div>
        )}

        {/* Toggle Wizard / Document */}
        {wizardAvailable && (
          <button
            type="button"
            onClick={() => setViewMode(m => m === 'wizard' ? 'document' : 'wizard')}
            title={viewMode === 'wizard' ? 'Voir le document complet' : 'Voir le mode wizard guidé'}
            style={{
              flexShrink: 0,
              padding: isMobile ? 0 : '8px 14px',
              width: isMobile ? 34 : undefined,
              height: isMobile ? 34 : undefined,
              fontSize: 12, fontWeight: 600,
              border: '1px solid #E5E7EB',
              borderRadius: isMobile ? 8 : 999,
              background: '#fff', color: '#6B7280',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {viewMode === 'wizard' ? <FileText size={isMobile ? 14 : 12} /> : <ListChecks size={isMobile ? 14 : 12} />}
            {!isMobile && (viewMode === 'wizard' ? 'Document' : 'Wizard')}
          </button>
        )}

        {/* Boutons d'envoi DESKTOP — directement dans le header (pas en bas) */}
        {!isLockedWeek && !isMobile && viewMode === 'document' && (
          <>
            <button
              type="button"
              onClick={() => handleSubmit('present')}
              disabled={submitting !== null || !canFinalize}
              title={canFinalize ? 'Faire signer le client maintenant via QR code' : 'Remplis tous les champs et signe d\'abord'}
              style={{
                padding: '8px 14px',
                fontSize: 12.5, fontWeight: 600,
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                background: '#fff', color: '#1C1A14',
                cursor: submitting !== null || !canFinalize ? 'not-allowed' : 'pointer',
                opacity: submitting !== null || !canFinalize ? 0.5 : 1,
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {submitting === 'present' ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
              QR code
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('remote')}
              disabled={submitting !== null || !canFinalize}
              title={canFinalize ? 'Envoyer au client par email/WhatsApp' : 'Remplis tous les champs et signe d\'abord'}
              style={{
                padding: '8px 16px',
                fontSize: 12.5, fontWeight: 700,
                border: '1px solid #1C1A14',
                borderRadius: 8,
                background: '#EAB308', color: '#1C1A14',
                cursor: submitting !== null || !canFinalize ? 'not-allowed' : 'pointer',
                opacity: submitting !== null || !canFinalize ? 0.5 : 1,
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {submitting === 'remote' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Envoyer au client
            </button>
          </>
        )}
      </header>

      {/* Mobile : WeekSelector sous le header */}
      {isMobile && (
        <div style={{
          flexShrink: 0,
          padding: '10px 14px',
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
        }}>
          <WeekSelector
            value={weekStart}
            onChange={setWeekStart}
            submissions={(data.submissions || []).map(s => ({ weekStart: s.week_start, status: s.status }))}
          />
        </div>
      )}

      {/* Bandeau verrouillage si déjà soumise */}
      {isLockedWeek && (
        <div style={{
          flexShrink: 0,
          padding: '10px 16px',
          background: '#DBEAFE',
          borderBottom: '1px solid #BFDBFE',
          color: '#1E40AF',
          fontSize: 12.5, lineHeight: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <CheckCircle2 size={14} />
          <span>
            <strong>Cette semaine a déjà été soumise.</strong> Sélectionne une autre semaine pour saisir un nouveau rapport.
          </span>
        </div>
      )}

      {/* Indicateur "remplis tous les champs" (desktop, état non-final) */}
      {!isLockedWeek && !isMobile && !canFinalize && viewMode === 'document' && (
        <div style={{
          flexShrink: 0,
          padding: '8px 16px',
          background: '#FEF3C7',
          borderBottom: '1px solid #FDE68A',
          color: '#A16207',
          fontSize: 11.5, lineHeight: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          ⚠️ Remplis tous les champs et signe (clique sur le champ Signature dans le document) avant de l&apos;envoyer
        </div>
      )}

      {/* Vue principale (Wizard ou Document) — flex:1 pour occuper l'espace.
          Desktop : background gris pour faire respirer le PDF qui est centré max 1100px. */}
      <main style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        background: !isMobile && viewMode === 'document' ? '#F3F4F6' : '#FAFAF7',
      }}>
        {viewMode === 'wizard' && wizardAvailable ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <SignWizard
              steps={wizardStepsForCandidat}
              documents={data.template.documents}
              fieldValues={values}
              onValueChange={handleFieldChange}
              signatureDataUrl={signatureDataUrl}
              onRequestSignature={() => setSignaturePadOpen(true)}
              autoFill={autoFill}
              recipientName={candidateFullName || 'Collaborateur'}
              envelopeTitle={data.link.title}
              completed={isLockedWeek}
              finalizing={submitting !== null}
              onFinalize={() => handleSubmit('remote')}
              onSwitchToDocumentMode={() => setViewMode('document')}
              token={slug /* clé sessionStorage pour persistance step */}
              contextData={{ weekStartDate: weekStart }}
              allDocumentFields={activeDoc?.fields || []}
            />
          </div>
        ) : activeDoc ? (
          // Desktop : centré avec max-width + padding latéral pour respirer.
          // Mobile : pleine largeur.
          <div style={{
            flex: 1, overflow: 'hidden', position: 'relative',
            display: 'flex', justifyContent: 'center',
            padding: isMobile ? 0 : '16px 24px 24px',
          }}>
            <div style={{
              flex: 1, minWidth: 0,
              maxWidth: isMobile ? '100%' : 1100,
              background: isMobile ? 'transparent' : '#fff',
              borderRadius: isMobile ? 0 : 12,
              boxShadow: isMobile ? 'none' : '0 4px 16px rgba(0,0,0,0.06)',
              border: isMobile ? 'none' : '1px solid #E5E7EB',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <PublicPdfViewer
                key={fileUrl}
                url={fileUrl}
                scrollToPage={scrollToPage}
                renderPageOverlay={!isLockedWeek ? (pageNum, sizePx) => (
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
                    currentRecipientOrder={1}
                  />
                ) : undefined}
              />
            </div>
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40, color: '#6B7280',
          }}>
            <div style={{ textAlign: 'center' }}>
              <FileText size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1A14' }}>Aucun document</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Le template ne contient pas de PDF.</div>
            </div>
          </div>
        )}
      </main>

      {/* Boutons d'envoi sticky bottom — MOBILE UNIQUEMENT (sur desktop ils sont dans le header).
          Masqués en mode Wizard (le wizard a son propre bouton finalize). */}
      {!isLockedWeek && viewMode === 'document' && isMobile && (
        <div style={{
          flexShrink: 0,
          padding: '10px 14px',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
          background: '#fff',
          borderTop: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <button
            type="button"
            onClick={() => handleSubmit('remote')}
            disabled={submitting !== null || !canFinalize}
            style={primaryBtnStyle(submitting === 'remote' || !canFinalize)}
          >
            {submitting === 'remote' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            📤 Envoyer au client
            <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('present')}
            disabled={submitting !== null || !canFinalize}
            style={secondaryBtnStyle(submitting === 'present' || !canFinalize)}
          >
            {submitting === 'present' ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
            🤝 Faire signer maintenant (QR)
          </button>
          {!canFinalize && (
            <div style={{ fontSize: 11, color: '#A16207', textAlign: 'center' }}>
              ⚠️ Remplis tous les champs et signe avant d&apos;envoyer
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers UI ────────────────────────────────────────────────────────

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

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 18px',
    fontSize: 14, fontWeight: 700,
    border: '1px solid #1C1A14', borderRadius: 10,
    background: '#EAB308', color: '#1C1A14',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    minHeight: 48,
    whiteSpace: 'nowrap',
  }
}

function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 18px',
    fontSize: 14, fontWeight: 600,
    border: '1px solid #E5E7EB', borderRadius: 10,
    background: '#fff', color: '#1C1A14',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    minHeight: 48,
    whiteSpace: 'nowrap',
  }
}
