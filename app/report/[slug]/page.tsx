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
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, Download, FileText,
  Loader2, Lock, RotateCw, Save, Send,
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
// v2.3.x Bug 1 — QRCodeModal supprimé (mode présentiel retiré). Le fichier reste
// dans components/report/ pour ne pas casser un éventuel import futur, mais on ne
// l'importe plus ici.

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

  // v2.3.x Bug 1 — Mode 'present' (QR) supprimé. submitting/confirmMode/submitted = boolean.
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  // v2.3.x Bug 2 — Dialog de confirmation après clic bouton "Envoyer au client"
  const [confirmOpen, setConfirmOpen] = useState(false)
  // v2.3.x Bug 3a — État "envoyé" pour message correct
  const [submitted, setSubmitted] = useState(false)
  // v2.3.x Bug 4 — État "renvoi en cours" + download
  const [resending, setResending] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

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
    // Reset signature + état soumission pour la nouvelle semaine
    setSignatureDataUrl(null)
    setSubmitted(false)
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

  // ─── Click bouton (ouvre le dialog de confirmation Bug 2) ───
  const handleClickSubmit = () => {
    if (!signatureDataUrl) {
      toast.error('Signe le rapport avant de l\'envoyer (clique sur le champ Signature dans le document)')
      setSignaturePadOpen(true)
      return
    }
    if (!canFinalize) {
      toast.error('Remplis tous les champs avant d\'envoyer')
      return
    }
    setConfirmOpen(true)
  }

  // ─── Submit (déclenché depuis le dialog après confirmation) ───
  const handleSubmit = async () => {
    if (!signatureDataUrl) return  // safety
    setSubmitting(true)
    setConfirmOpen(false)
    try {
      const r = await fetch(`/api/reports/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: weekStart,
          field_values: values,
          signature_data_url: signatureDataUrl,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur soumission')
      // Cleanup localStorage
      try { localStorage.removeItem(`tf_report_draft_${slug}_${weekStart}`) } catch {}
      // v2.3.x Bug 3a — Message correct post-envoi (PDF signé envoyé seulement APRÈS signature client)
      setSubmitted(true)
      toast.success('Rapport soumis et envoyé à votre client')
      // Refresh submissions
      fetch(`/api/reports/${slug}`)
        .then(r => r.json())
        .then((nd: VerifyResponse) => { if (nd.valid) setData(nd) })
        .catch(() => {})
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── v2.3.x Bug 4 — Renvoyer la notif client (route /resend dédiée) ───
  const handleResendToClient = async () => {
    if (!submissionForWeek) return
    if (!confirm('Renvoyer la notification au client ? Le lien de signature reste valide 7 jours.')) return
    setResending(true)
    try {
      const r = await fetch(`/api/reports/${slug}/submissions/${submissionForWeek.id}/resend`, {
        method: 'POST',
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Notification renvoyée au client')
    } catch (e: any) {
      toast.error(e.message || 'Erreur renvoi')
    } finally {
      setResending(false)
    }
  }

  // ─── v2.3.x Bug 4 — Télécharger le PDF de la submission ───
  const handleDownload = async (submissionId: string, label: string) => {
    setDownloading(submissionId)
    try {
      const r = await fetch(`/api/reports/${slug}/submissions/${submissionId}/download`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur téléchargement')
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      // v2.3.3 Bug 2 — Ouvrir dans un nouvel onglet (pas télécharger)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 8000)
      toast.success(label)
    } catch (e: any) {
      toast.error(e.message || 'Erreur téléchargement')
    } finally {
      setDownloading(null)
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

  // v2.3.3 Bug 1 — Message post-soumission centré (carte, pas footer sticky)
  if (submitted) {
    return (
      <CenteredCard>
        <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={28} /></div>
        <h1 style={titleStyle}>Merci pour votre rapport&nbsp;!</h1>
        <p style={textStyle}>Il a été envoyé au client pour validation.</p>
      </CenteredCard>
    )
  }

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

      {/* v2.3.x Bug 1 — QRCodeModal supprimé */}

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

        {/* v2.3.9 Bug 8 — Toggle Wizard/Document supprimé (mode auto :
            mobile=wizard / desktop=document). Le candidat n'a pas besoin du choix. */}

        {/* v2.3.14 — Indicateur + bouton "Envoyer au client" COMPACT en haut DESKTOP.
            Remplace le footer sticky bottom (masqué sur desktop). */}
        {!isMobile && !isLockedWeek && !submitted && (
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
              onClick={handleClickSubmit}
              disabled={submitting || !canFinalize}
              title={!canFinalize ? 'Remplis tous les champs et signe avant d\'envoyer' : 'Envoyer le rapport au client'}
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
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Envoyer au client
            </button>
          </>
        )}

        {/* v2.3.x Bug 3b — Boutons d'envoi déplacés dans un footer sticky bottom toujours visible
            (mobile + desktop, mode wizard + document). Voir bloc footer plus bas. */}
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

      {/* v2.3.x Bug 2c — Bandeau dynamique selon status submission */}
      {isLockedWeek && submissionForWeek && (() => {
        const st = submissionForWeek.status
        const clientName = data.link.client_name || 'le client'
        if (st === 'completed' || st === 'client_signed') {
          // Validé : vert + bouton télécharger
          return (
            <div style={bannerStyle('#D1FAE5', '#6EE7B7', '#065F46')}>
              <CheckCircle2 size={14} />
              <span style={{ flex: 1, textAlign: 'center' }}>
                ✓ <strong>Validé par {clientName}</strong>
                {submissionForWeek.client_signed_at && (
                  <> le {new Date(submissionForWeek.client_signed_at).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}</>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleDownload(submissionForWeek.id, 'PDF signé téléchargé')}
                disabled={downloading === submissionForWeek.id}
                style={bannerBtnStyle('#065F46')}
              >
                {downloading === submissionForWeek.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Download size={12} />}
                Télécharger
              </button>
            </div>
          )
        }
        if (st === 'candidate_signed') {
          // En attente client : jaune + bouton renvoyer + bouton aperçu direct
          // v2.3.5 Bug 3a — window.open direct (plus fiable que blob fetch)
          return (
            <div style={bannerStyle('#FEF3C7', '#FDE68A', '#A16207')}>
              <Clock size={14} />
              <span style={{ flex: 1, textAlign: 'center' }}>
                ⏳ <strong>En attente de signature de {clientName}</strong>
              </span>
              <button
                type="button"
                onClick={handleResendToClient}
                disabled={resending}
                style={bannerBtnStyle('#A16207')}
              >
                {resending ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                Renvoyer
              </button>
              <button
                type="button"
                onClick={() => window.open(`/api/reports/${slug}/submissions/${submissionForWeek.id}/download`, '_blank', 'noopener,noreferrer')}
                style={bannerBtnStyle('#A16207')}
              >
                <Download size={12} />
                Aperçu
              </button>
            </div>
          )
        }
        // cancelled
        return (
          <div style={bannerStyle('#FEE2E2', '#FCA5A5', '#991B1B')}>
            <Lock size={14} />
            <span>
              <strong>Cette semaine a été annulée.</strong> Sélectionne une autre semaine.
            </span>
          </div>
        )
      })()}

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
              completed={isLockedWeek || !!submitted}
              finalizing={submitting}
              // v2.3.x Bug 2 — Pas de RecapStep finale ; onFinalize ouvre le dialog confirmation
              hideRecap
              finalizeButtonLabel="Confirmer et envoyer"
              onFinalize={handleClickSubmit}
              onSwitchToDocumentMode={() => setViewMode('document')}
              token={slug /* clé sessionStorage pour persistance step */}
              contextData={{ weekStartDate: weekStart }}
              allDocumentFields={activeDoc?.fields || []}
            />
          </div>
        ) : activeDoc ? (
          // v2.3.x — Bug 2 fix : aligné EXACTEMENT sur le pattern Sign /sign/v/[token]
          //   (`flex: 1; overflow: hidden; position: relative`) sans flex column wrapper qui
          //   décalait l'overlay. Sur desktop on garde une card visuelle via background +
          //   shadow appliqués au wrapper externe (et pas via un sous-wrapper flex).
          //
          //   Mobile : PublicPdfViewer en enfant direct, plein écran, comme Sign.
          //   Desktop : padding latéral + container max 1100 centré, mais SANS display:flex
          //             interne (le PublicPdfViewer mesure son containerWidth via
          //             ResizeObserver — le contraindre dans un flex column casse la mesure
          //             initiale et décale les coords des fields qui sont en x*sizePx.width).
          isMobile ? (
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <PublicPdfViewer
                key={fileUrl}
                url={fileUrl}
                scrollToPage={scrollToPage}
                renderPageOverlay={(pageNum, sizePx) => (
                  // v2.3.5 Bug 3b — overlay toujours actif ; verrouillé = lecture seule
                  <PublicFieldsLayer
                    page={pageNum}
                    sizePx={sizePx}
                    fields={activeDoc.fields || []}
                    values={values}
                    onValueChange={isLockedWeek ? () => {} : handleFieldChange}
                    signatureDataUrl={signatureDataUrl}
                    onRequestSignature={isLockedWeek ? () => {} : () => setSignaturePadOpen(true)}
                    recipientColor={recipientPalette}
                    autoFill={autoFill}
                    currentRecipientOrder={isLockedWeek ? 99 : 1}
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
                  scrollToPage={scrollToPage}
                  renderPageOverlay={(pageNum, sizePx) => (
                    // v2.3.5 Bug 3b — overlay toujours actif ; verrouillé = lecture seule
                    <PublicFieldsLayer
                      page={pageNum}
                      sizePx={sizePx}
                      fields={activeDoc.fields || []}
                      values={values}
                      onValueChange={isLockedWeek ? () => {} : handleFieldChange}
                      signatureDataUrl={signatureDataUrl}
                      onRequestSignature={isLockedWeek ? () => {} : () => setSignaturePadOpen(true)}
                      recipientColor={recipientPalette}
                      autoFill={autoFill}
                      currentRecipientOrder={isLockedWeek ? 99 : 1}
                    />
                  )}
                />
              </div>
            </div>
          )
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

      {/* v2.3.x Bug 3b — Footer sticky bottom (mobile uniquement depuis v2.3.14) :
          ergonomie tactile (bouton large pouce-friendly). Sur DESKTOP, le bouton
          compact en haut du header suffit (footer masqué pour gagner de la place). */}
      {!isLockedWeek && !submitted && isMobile && (
        <div style={{
          flexShrink: 0,
          padding: isMobile ? '10px 14px' : '14px 24px',
          paddingBottom: isMobile ? 'max(10px, env(safe-area-inset-bottom, 10px))' : 14,
          background: '#fff',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 8 : 12,
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: isMobile ? undefined : 'flex-end',
        }}>
          {!canFinalize && (
            <div style={{
              fontSize: 12, color: '#A16207',
              flex: isMobile ? undefined : 1,
              textAlign: isMobile ? 'center' : 'left',
            }}>
              ⚠️ Remplis tous les champs et signe avant d&apos;envoyer
            </div>
          )}
          {/* v2.3.x Bug 1 — Plus que le bouton "Envoyer au client" (mode QR supprimé) */}
          <button
            type="button"
            onClick={handleClickSubmit}
            disabled={submitting || !canFinalize}
            style={isMobile ? primaryBtnStyle(submitting || !canFinalize) : desktopPrimaryBtn(submitting || !canFinalize)}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            📤 Envoyer au client
            {isMobile && <ArrowRight size={14} style={{ marginLeft: 'auto' }} />}
          </button>
        </div>
      )}

      {/* v2.3.3 Bug 1 — Message post-envoi géré par early return (CenteredCard) au-dessus */}

      {/* v2.3.x Bug 2 — Dialog de confirmation après clic bouton */}
      {confirmOpen && (
        <ConfirmDialog
          weekLabel={weekDates.label}
          clientName={data.link.client_name || ''}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleSubmit}
        />
      )}
    </div>
  )
}

// ─── Helpers UI bandeaux dynamiques (Bug 2c v2.3.x) ───────────────────

function bannerStyle(bg: string, border: string, color: string): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: '10px 16px',
    background: bg,
    borderBottom: `1px solid ${border}`,
    color,
    fontSize: 12.5, lineHeight: 1.5,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    flexWrap: 'wrap',
  }
}
function bannerBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px',
    fontSize: 11.5, fontWeight: 700,
    border: `1px solid ${color}`, borderRadius: 6,
    background: 'rgba(255,255,255,0.6)', color,
    cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  }
}

// ─── Dialog de confirmation envoi (Bug 2) ─────────────────────────────

function ConfirmDialog({
  weekLabel, clientName, onCancel, onConfirm,
}: {
  weekLabel: string
  clientName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: 'inherit',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 460, width: '100%',
          background: '#fff',
          borderRadius: 16, border: '1px solid #E5E7EB',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          padding: '28px 26px',
        }}
      >
        <h2 style={{
          margin: 0, marginBottom: 8,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 22, fontWeight: 400, color: '#1C1A14',
          letterSpacing: '-0.3px',
        }}>
          Confirmer l&apos;envoi&nbsp;?
        </h2>
        <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.55, margin: '0 0 16px' }}>
          Le rapport pour la <strong>{weekLabel}</strong> sera envoyé{clientName ? <> à <strong>{clientName}</strong></> : null} pour validation et signature.
        </p>
        <div style={{
          padding: '10px 12px',
          background: '#FAFAF7',
          borderRadius: 10,
          fontSize: 12.5, color: '#1C1A14',
          marginBottom: 18,
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 600 }}>
            <CheckCircle2 size={13} /> Rapport signé
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              fontSize: 13, fontWeight: 600,
              border: '1px solid #E5E7EB', borderRadius: 10,
              background: '#fff', color: '#1C1A14',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 18px',
              fontSize: 13, fontWeight: 700,
              border: '1px solid #1C1A14', borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <CheckCircle2 size={14} />
            Confirmer et envoyer
          </button>
        </div>
      </div>
    </div>
  )
}

// Styles desktop boutons (à côté de mobile primaryBtnStyle/secondaryBtnStyle)
function desktopPrimaryBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 18px',
    fontSize: 13.5, fontWeight: 700,
    border: '1px solid #1C1A14', borderRadius: 10,
    background: '#EAB308', color: '#1C1A14',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    minHeight: 42,
    whiteSpace: 'nowrap',
  }
}
function desktopSecondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 18px',
    fontSize: 13.5, fontWeight: 600,
    border: '1px solid #E5E7EB', borderRadius: 10,
    background: '#fff', color: '#1C1A14',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    minHeight: 42,
    whiteSpace: 'nowrap',
  }
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
