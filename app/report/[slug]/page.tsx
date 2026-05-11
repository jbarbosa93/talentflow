// TalentFlow Rapports — Page publique candidat (lien permanent)
// v2.4.0 Phase 1 — landing mobile + multi-entreprise + note + bouton WhatsApp
//
// URL : /report/{slug}
// Lien permanent : pas de token, pas d'expiration. Flow :
//   1. Landing (welcome + missions récentes + bouton "Nouveau rapport")
//   2. Si ≥ 2 entreprises configurées → ClientSelector
//      Sinon → skip direct au form (1ʳᵉ entreprise auto-sélectionnée)
//   3. Form (WeekSelector + PDF/Wizard + Notes + 2 boutons d'envoi)
'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, Download, FileText,
  Loader2, Lock, MessageCircle, RotateCw, Save, Send, ChevronLeft,
} from 'lucide-react'
import WeekSelector from '@/components/report/WeekSelector'
import PublicFieldsLayer, { areAllRequiredFieldsFilled } from '@/components/sign/PublicFieldsLayer'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import type { SignDocument, SignField } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
import type { ReportSubmissionStatus, ReportLinkClient } from '@/lib/report/types'
import CandidatWelcomeHeader from '@/components/report/CandidatWelcomeHeader'
import ClientSelector from '@/components/report/ClientSelector'
import MissionList, { type MissionItem } from '@/components/report/MissionList'
import HistoryAccordion from '@/components/report/HistoryAccordion'
import RecapPeriode from '@/components/report/RecapPeriode'
import ContactAgenceButton from '@/components/report/ContactAgenceButton'
import SubmissionViewerModal from '@/components/report/SubmissionViewerModal'
import { toWhatsAppSafe } from '@/lib/report/text-format'
import { waMeUrl } from '@/lib/lagence-contact'
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

  // v2.4.0 — Multi-entreprise + landing page
  const [clients, setClients] = useState<ReportLinkClient[]>([])
  const [selectedClient, setSelectedClient] = useState<ReportLinkClient | null>(null)
  const [phase, setPhase] = useState<'landing' | 'select_client' | 'form'>('landing')
  const [notesCandidat, setNotesCandidat] = useState<string>('')
  const [sendingWa, setSendingWa] = useState(false)
  // v2.4.1 — Historique + récap (landing)
  const [showFullHistory, setShowFullHistory] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  // v2.4.2 — Modal viewer rapport complété (tap sur card "Validé")
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerSubmission, setViewerSubmission] = useState<{
    id: string; week_start: string; week_end: string;
  } | null>(null)

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

  // v2.4.0 — Fetch entreprises autorisées
  useEffect(() => {
    if (state !== 'ok') return
    fetch(`/api/reports/${slug}/clients`)
      .then(r => r.json())
      .then((d: { clients?: ReportLinkClient[] }) => {
        const list = d.clients || []
        setClients(list)
        // v2.4.0 — Si 1 seule entreprise → skip ClientSelector, auto-select
        if (list.length === 1) setSelectedClient(list[0])
      })
      .catch(() => { /* silent : fallback legacy possible */ })
  }, [slug, state])

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

  // ─── Submit DB (commun aux 2 boutons : Email et WhatsApp) ───
  const submitToDb = useCallback(async (): Promise<{ ok: boolean; clientToken?: string | null }> => {
    if (!signatureDataUrl) return { ok: false }
    const r = await fetch(`/api/reports/${slug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week_start: weekStart,
        field_values: values,
        signature_data_url: signatureDataUrl,
        report_link_client_id: selectedClient?.id || null,
        notes_candidat: notesCandidat.trim() || null,
      }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Erreur soumission')
    try { localStorage.removeItem(`tf_report_draft_${slug}_${weekStart}`) } catch {}
    return { ok: true, clientToken: d.client_token || null }
  }, [slug, weekStart, values, signatureDataUrl, selectedClient, notesCandidat])

  // ─── Submit Email (bouton "Envoyer au client") ───
  const handleSubmit = async () => {
    if (!signatureDataUrl) return  // safety
    setSubmitting(true)
    setConfirmOpen(false)
    try {
      await submitToDb()
      setSubmitted(true)
      toast.success(`Rapport envoyé${selectedClient?.client_email ? ` à ${selectedClient.client_email}` : ''}`)
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

  // ─── Submit WhatsApp (bouton "Envoyer par WhatsApp à mon responsable") ───
  // v2.4.3 — Le client reçoit toujours par email côté infra. Le bouton WhatsApp
  // ouvre wa.me/?text=… SANS numéro pré-rempli : le candidat choisit son contact
  // dans WhatsApp (picker natif). Submit DB en parallèle pour marquer submitted=true.
  const handleSubmitWhatsApp = async () => {
    if (!signatureDataUrl) {
      toast.error('Signe le rapport avant de l\'envoyer')
      setSignaturePadOpen(true)
      return
    }
    if (!canFinalize) {
      toast.error('Remplis tous les champs avant d\'envoyer')
      return
    }
    setSendingWa(true)
    try {
      const { clientToken } = await submitToDb()
      const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const signUrl = clientToken ? `${appUrl}/report/client/${clientToken}` : ''
      const contactName = selectedClient?.client_contact_name || selectedClient?.client_name || 'votre responsable'
      const candidateName = data?.candidat
        ? [data.candidat.prenom, data.candidat.nom].filter(Boolean).join(' ')
        : (data?.link?.title || 'Le collaborateur')
      const msg = toWhatsAppSafe(
        `Bonjour ${contactName},\n\n`
        + `Je viens de remplir mon rapport d'heures pour la ${weekDates.label}.\n\n`
        + `Merci de cliquer sur le lien pour valider :\n${signUrl}\n\n`
        + `- ${candidateName}`,
      )
      // v2.4.3 — Pas de phone : ouvre wa.me/?text=… → picker contact WhatsApp natif.
      const url = waMeUrl('', msg)
      if (isMobile) {
        window.location.href = url
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      setSubmitted(true)
      toast.success('Rapport enregistré — choisissez votre responsable dans WhatsApp')
      fetch(`/api/reports/${slug}`)
        .then(r => r.json())
        .then((nd: VerifyResponse) => { if (nd.valid) setData(nd) })
        .catch(() => {})
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSendingWa(false)
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
      <>
        <CenteredCard>
          <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={28} /></div>
          <h1 style={titleStyle}>Merci pour votre rapport&nbsp;!</h1>
          <p style={textStyle}>Il a été envoyé au client pour validation.</p>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false)
              setSelectedClient(clients.length === 1 ? clients[0] : null)
              setPhase('landing')
              setNotesCandidat('')
              setSignatureDataUrl(null)
            }}
            style={{
              marginTop: 18,
              padding: '10px 18px',
              fontSize: 13, fontWeight: 700,
              border: '1px solid #1C1A14', borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Retour à l&apos;accueil
          </button>
        </CenteredCard>
        <ContactAgenceButton />
      </>
    )
  }

  // v2.4.0 — Données pour landing
  const candidatePrenomLanding = data.candidat?.prenom || ''
  const allMissions: MissionItem[] = (data.submissions || []).map(s => {
    const clientId = (s as any).report_link_client_id || null
    const resolvedClient = clientId ? clients.find(c => c.id === clientId) : null
    return {
      id: s.id,
      week_start: s.week_start,
      week_end: s.week_end,
      status: s.status,
      client_name: resolvedClient?.client_name || data.link?.client_name || null,
      report_link_client_id: clientId,
    }
  })
  const recentMissions = allMissions.slice(0, 3)
  const hasMoreHistory = allMissions.length > 3

  // v2.4.2 — Tap sur une mission : draft = reprendre, completed = ouvrir viewer
  const handleSelectMission = (m: MissionItem) => {
    if (m.status === 'draft' || m.status === 'cancelled') {
      // Reprendre brouillon : restaure week + entreprise et passe en form
      const targetClient = m.report_link_client_id
        ? clients.find(c => c.id === m.report_link_client_id) || null
        : (clients.length === 1 ? clients[0] : null)
      setSelectedClient(targetClient)
      setWeekStart(m.week_start)
      setPhase('form')
      return
    }
    // Complété, signé candidat ou client → ouvre le viewer modal
    setViewerSubmission({ id: m.id, week_start: m.week_start, week_end: m.week_end })
    setViewerOpen(true)
  }

  // v2.4.0 — Page accueil (landing) mobile-first
  if (phase === 'landing') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAFAF7',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        paddingBottom: 100,
      }}>
        <CandidatWelcomeHeader prenom={candidatePrenomLanding} />
        <div style={{ padding: '6px 16px 18px' }}>
          <button
            type="button"
            onClick={() => {
              if (clients.length >= 2) setPhase('select_client')
              else setPhase('form')
            }}
            style={{
              width: '100%',
              minHeight: 56,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px',
              background: '#EAB308',
              color: '#1C1A14',
              border: '1px solid #1C1A14',
              borderRadius: 14,
              fontSize: 15, fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(28,26,20,0.08)',
            }}
          >
            <ClipboardList size={18} /> Nouveau rapport
          </button>
        </div>
        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#6B7280',
            marginBottom: 10,
          }}>
            Mes derniers rapports
          </div>
        </div>
        <MissionList items={recentMissions} onSelect={handleSelectMission} emptyText="Aucun rapport pour le moment. Commencez par créer le premier !" />

        {/* v2.4.1 — Bouton "Voir tout l'historique" (accordion expand) */}
        {hasMoreHistory && (
          <div style={{ padding: '12px 16px 0' }}>
            <button
              type="button"
              onClick={() => setShowFullHistory(v => !v)}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '10px 14px',
                background: 'transparent',
                color: '#1C1A14',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {showFullHistory ? 'Masquer l\'historique' : `Voir tout l\'historique (${allMissions.length})`}
              <span style={{ fontSize: 12 }}>{showFullHistory ? '↑' : '→'}</span>
            </button>
          </div>
        )}
        {showFullHistory && (
          <div style={{ marginTop: 14 }}>
            <HistoryAccordion items={allMissions} defaultOpenIndex={0} onSelect={handleSelectMission} />
          </div>
        )}

        {/* v2.4.1 — Section Récapitulatif (collapsible) */}
        {allMissions.length > 0 && (
          <div style={{ padding: '18px 16px 0' }}>
            <button
              type="button"
              onClick={() => setShowRecap(v => !v)}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '10px 14px',
                background: '#1C1A14',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 13.5, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              📊 {showRecap ? 'Masquer le récapitulatif' : 'Récapitulatif par période'}
            </button>
            {showRecap && (
              <div style={{ marginTop: 14 }}>
                <RecapPeriode slug={slug} scope="candidate" />
              </div>
            )}
          </div>
        )}

        <ContactAgenceButton />

        {/* v2.4.2 — Modal viewer rapport complété (tap sur card "Validé") */}
        {viewerSubmission && (
          <SubmissionViewerModal
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            pdfUrl={`/api/reports/${slug}/submissions/${viewerSubmission.id}/download`}
            title={`Rapport ${[data.candidat?.prenom, data.candidat?.nom].filter(Boolean).join(' ') || ''}`.trim() || 'Rapport'}
            subtitle={`Semaine du ${viewerSubmission.week_start} au ${viewerSubmission.week_end}`}
          />
        )}
      </div>
    )
  }

  // v2.4.0 — Phase select_client (uniquement si ≥ 2 entreprises)
  if (phase === 'select_client') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAFAF7',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        paddingBottom: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 14px 8px' }}>
          <button
            type="button"
            onClick={() => setPhase('landing')}
            aria-label="Retour"
            style={{
              width: 40, height: 40, borderRadius: 10,
              border: '1px solid #E5E7EB', background: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#1C1A14',
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <h1 style={{
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 22, fontWeight: 400,
            margin: 0, color: '#1C1A14', letterSpacing: '-0.01em',
          }}>
            Nouveau rapport
          </h1>
        </div>
        <div style={{ paddingTop: 6 }}>
          <ClientSelector
            clients={clients}
            onSelect={(c) => {
              setSelectedClient(c)
              setPhase('form')
            }}
          />
        </div>
        <ContactAgenceButton />
      </div>
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
    companyName: selectedClient?.client_name || data.link.client_name || '',
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
        {/* v2.4.0 — Bouton retour vers landing */}
        <button
          type="button"
          onClick={() => setPhase('landing')}
          aria-label="Retour à l'accueil"
          title="Retour à l'accueil"
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: '1px solid #E5E7EB', background: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#1C1A14',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={16} />
        </button>
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
              {selectedClient ? selectedClient.client_name : (candidateFullName ? `Rapport — ${candidateFullName}` : 'Rapport hebdomadaire')}
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

        {/* v2.4.0 — Indicateur compact desktop (les 2 boutons sont en footer pour les 2 plateformes) */}
        {!isMobile && !isLockedWeek && !submitted && !canFinalize && (
          <span style={{
            fontSize: 11.5, color: '#A16207', whiteSpace: 'nowrap',
            fontWeight: 600,
          }}>
            ⚠️ Champs requis manquants
          </span>
        )}

        {/* v2.4.2 — Bouton Contacter L-Agence COMPACT en haut à droite du header */}
        <ContactAgenceButton variant="compact" />
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

      {/* v2.4.2 — Panneau finalisation SIMPLIFIÉ : note + 1 seul bouton "Confirmer et envoyer".
          Les 2 boutons WhatsApp / Email + bandeaux info/alerte sont déplacés DANS le dialog
          SendChannelDialog ouvert au clic — affichés UNIQUEMENT après signature. */}
      {!isLockedWeek && !submitted && (
        <div style={{
          flexShrink: 0,
          padding: isMobile ? '12px 14px' : '14px 24px',
          paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom, 12px))' : 16,
          background: '#fff',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* Note candidat (optionnelle, max 300 chars) */}
          <details style={{
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            background: '#FAFAF7',
          }}>
            <summary style={{
              padding: '8px 12px',
              fontSize: 12.5, fontWeight: 600,
              color: '#1C1A14', cursor: 'pointer',
              userSelect: 'none',
            }}>
              📝 Ajouter une note pour votre responsable {notesCandidat ? `(${notesCandidat.length}/300)` : '(optionnel)'}
            </summary>
            <div style={{ padding: '4px 12px 12px' }}>
              <textarea
                value={notesCandidat}
                onChange={(e) => setNotesCandidat(e.target.value.slice(0, 300))}
                placeholder="Ex : Déplacement mercredi inclus, travail chantier X les jeudi-vendredi."
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
                {notesCandidat.length}/300
              </div>
            </div>
          </details>

          {/* Warning si non-finalisable */}
          {!canFinalize && (
            <div style={{
              fontSize: 12, color: '#A16207',
              textAlign: 'center',
            }}>
              ⚠️ Remplis tous les champs et signe avant d&apos;envoyer
            </div>
          )}

          {/* Un seul bouton "Confirmer et envoyer" — ouvre SendChannelDialog */}
          <button
            type="button"
            onClick={handleClickSubmit}
            disabled={submitting || sendingWa || !canFinalize}
            style={{
              width: '100%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 18px',
              fontSize: 15, fontWeight: 700,
              border: '1px solid #1C1A14', borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: (submitting || sendingWa || !canFinalize) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: (submitting || sendingWa || !canFinalize) ? 0.5 : 1,
              minHeight: 52,
            }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Confirmer et envoyer
          </button>
        </div>
      )}

      {/* v2.3.3 Bug 1 — Message post-envoi géré par early return (CenteredCard) au-dessus */}

      {/* v2.4.2 — Dialog choix canal (WhatsApp ou Email auto) après clic "Confirmer et envoyer"
          v2.4.3 — WhatsApp TOUJOURS actif (le candidat choisit son contact lui-même) */}
      {confirmOpen && (
        <SendChannelDialog
          weekLabel={weekDates.label}
          clientName={selectedClient?.client_name || data.link.client_name || ''}
          sendingWa={sendingWa}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onSendEmail={handleSubmit}
          onSendWhatsApp={() => { setConfirmOpen(false); handleSubmitWhatsApp() }}
        />
      )}

      {/* v2.4.2 — Le bouton "Contacter L-Agence" est déjà dans le header (variant compact).
          Pas de floating bottom-right sur la page form pour libérer la zone du clavier mobile. */}
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

// ─── v2.4.2 — Dialog choix canal (WhatsApp ou Email auto) ─────────────
// Affiché APRÈS signature au clic sur "Confirmer et envoyer". Contient :
//  - Header avec semaine + entreprise
//  - 2 boutons (WhatsApp + Email auto). WhatsApp grisé si pas de phone.
//  - Bandeau amber info + bandeau rouge alerte "Pas à L-Agence"

function SendChannelDialog({
  weekLabel, clientName, sendingWa, submitting,
  onCancel, onSendEmail, onSendWhatsApp,
}: {
  weekLabel: string
  clientName: string
  sendingWa: boolean
  submitting: boolean
  onCancel: () => void
  onSendEmail: () => void
  onSendWhatsApp: () => void
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
          maxWidth: 480, width: '100%',
          maxHeight: '92vh', overflow: 'auto',
          background: '#fff',
          borderRadius: 16, border: '1px solid #E5E7EB',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          padding: '24px 22px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <h2 style={{
          margin: 0,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 22, fontWeight: 400, color: '#1C1A14',
          letterSpacing: '-0.3px',
        }}>
          Comment voulez-vous envoyer&nbsp;?
        </h2>
        <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.55, margin: 0 }}>
          Rapport <strong>{weekLabel}</strong>{clientName ? <> destiné à <strong>{clientName}</strong></> : null}.
        </p>
        <div style={{
          padding: '8px 12px',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: 10,
          fontSize: 12.5, color: '#065F46',
          display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
        }}>
          <CheckCircle2 size={14} /> Rapport signé — choisissez le canal d&apos;envoi
        </div>

        {/* Bouton 1 — WhatsApp (v2.4.3 : toujours actif, picker contact natif) */}
        <button
          type="button"
          onClick={onSendWhatsApp}
          disabled={sendingWa || submitting}
          title="Ouvrir WhatsApp et choisir votre responsable dans vos contacts"
          style={{
            width: '100%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 16px',
            fontSize: 14.5, fontWeight: 700,
            border: '1px solid #128C7E', borderRadius: 12,
            background: '#25D366',
            color: '#fff',
            cursor: (sendingWa || submitting) ? 'not-allowed' : 'pointer',
            opacity: (sendingWa || submitting) ? 0.55 : 1,
            fontFamily: 'inherit',
            minHeight: 52,
          }}
        >
          {sendingWa ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
          Envoyer par WhatsApp à mon responsable
        </button>

        {/* Bouton 2 — Email auto */}
        <button
          type="button"
          onClick={onSendEmail}
          disabled={submitting || sendingWa}
          style={{
            width: '100%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 16px',
            fontSize: 14.5, fontWeight: 700,
            border: '1px solid #1C1A14', borderRadius: 12,
            background: '#EAB308', color: '#1C1A14',
            cursor: (submitting || sendingWa) ? 'not-allowed' : 'pointer',
            opacity: (submitting || sendingWa) ? 0.55 : 1,
            fontFamily: 'inherit',
            minHeight: 52,
          }}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Envoyer au client automatiquement
        </button>

        {/* Bandeau info amber (v2.4.3 : message clarifié — pas de pré-remplissage du numéro) */}
        <div style={{
          padding: '10px 12px',
          background: '#FEF3C7',
          border: '1px solid #FDE68A',
          borderRadius: 10,
          fontSize: 12, color: '#92400E', lineHeight: 1.5,
        }}>
          <strong>WhatsApp</strong> : votre application s&apos;ouvre, vous choisissez votre responsable dans vos contacts. <strong>Email</strong> : envoi automatique à l&apos;adresse configurée par L-Agence.
        </div>

        {/* Bandeau alerte rouge */}
        <div style={{
          padding: '10px 12px',
          background: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: 10,
          fontSize: 12, color: '#991B1B', lineHeight: 1.5,
        }}>
          ⚠️ <strong>N&apos;envoyez PAS ce lien à L-Agence SA.</strong> Envoyez-le uniquement à votre responsable direct.
        </div>

        {/* Annuler */}
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting || sendingWa}
          style={{
            marginTop: 4,
            padding: '10px 16px',
            fontSize: 13, fontWeight: 600,
            border: '1px solid #E5E7EB', borderRadius: 10,
            background: '#fff', color: '#6B7280',
            cursor: (submitting || sendingWa) ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          Annuler
        </button>
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
