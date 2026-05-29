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
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, Download, Eye, FileText,
  Loader2, Lock, RotateCw, Save, Send, ChevronLeft,
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
import MissionInfoList from '@/components/report/MissionInfoList'
import MissionInfoModal from '@/components/report/MissionInfoModal'
import HistoryAccordion from '@/components/report/HistoryAccordion'
import RecapPeriode from '@/components/report/RecapPeriode'
import ContactAgenceButton from '@/components/report/ContactAgenceButton'
import SubmissionViewerModal from '@/components/report/SubmissionViewerModal'
import LogoLAgence from '@/components/report/LogoLAgence'
// v2.4.4 — toWhatsAppSafe + waMeUrl retirés : plus de bouton WhatsApp côté candidat
// (sécurité — un candidat malhonnête pouvait copier le lien et le forwarder à un complice).
// Le seul canal d'envoi au client est désormais email automatique vers client_email.
import {
  getCurrentWeekStart, isoDate, getWeekDates, parseIsoDate,
} from '@/lib/report/week-helpers'
import { formatDateChDot } from '@/lib/report/text-format'
import { buildBlockedDaysForWeek, buildBlockedFieldsMap, type DayBlockReason } from '@/lib/report/day-blocking'
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
  // v2.7.3 — Modal infos mission (clic sur card "Mes missions" en landing)
  const [missionInfoClient, setMissionInfoClient] = useState<ReportLinkClient | null>(null)
  const [phase, setPhase] = useState<'landing' | 'select_client' | 'form'>('landing')
  const [notesCandidat, setNotesCandidat] = useState<string>('')
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

  // v2.6.2 — Jours déjà déclarés sur d'autres rapports validés (autres entreprises)
  const [declaredByOthers, setDeclaredByOthers] = useState<{ clientName: string; daysIso: string[] }[]>([])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  // ─── Fetch initial ──────────────────────────────────────────────────
  // v2.9.0 — Si l'API renvoie 401 (auth_required=true sans session), redirect login
  useEffect(() => {
    fetch(`/api/reports/${slug}`)
      .then(async r => {
        if (r.status === 401) {
          if (typeof window !== 'undefined') {
            const next = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.replace(`/report/login?next=${next}`)
          }
          return null
        }
        return r.json()
      })
      .then((d: VerifyResponse | null) => {
        if (!d) return
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

  // v2.6.2 — Auto-correction weekStart si hors fenêtre mission après changement d'entreprise
  useEffect(() => {
    const start = selectedClient?.mission_start_date || null
    const end = selectedClient?.mission_end_date || null
    if (!start && !end) return
    const weekEndIso = (() => {
      const d = new Date(weekStart + 'T00:00:00')
      d.setDate(d.getDate() + 6)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const beforeMission = !!(start && weekEndIso < start)
    const afterMission  = !!(end && weekStart > end)
    if (!beforeMission && !afterMission) return
    // Tombée hors fenêtre → repositionner sur la semaine courante ou la 1ʳᵉ valide
    const fallback = isoDate(getCurrentWeekStart())
    setWeekStart(fallback)
  }, [selectedClient, weekStart])

  // v2.6.2 — Fetch jours déclarés ailleurs (étape D) à chaque changement semaine+entreprise
  useEffect(() => {
    if (state !== 'ok') { setDeclaredByOthers([]); return }
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) { setDeclaredByOthers([]); return }
    const exclude = selectedClient?.id || ''
    const url = `/api/reports/${slug}/declared-days?week=${weekStart}${exclude ? `&exclude=${exclude}` : ''}`
    let cancelled = false
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled || !d || !Array.isArray(d.byClient)) return
        setDeclaredByOthers(d.byClient.map((c: any) => ({
          clientName: c.client_name || 'Autre entreprise',
          daysIso: Array.isArray(c.daysIso) ? c.daysIso : [],
        })))
      })
      .catch(() => { if (!cancelled) setDeclaredByOthers([]) })
    return () => { cancelled = true }
  }, [slug, state, weekStart, selectedClient])

  // ─── Find existing submission for selected week + selected entreprise ─
  // v2.5.0 — Multi-entreprise même semaine : on cherche une soumission SCOPÉE
  // sur (week_start, report_link_client_id). Permet d'avoir 2 rapports sur la
  // même semaine si le candidat travaille pour 2 entreprises différentes.
  const submissionForWeek = useMemo(() => {
    const targetClientId = selectedClient?.id || null
    return data?.submissions?.find(s => {
      if (s.week_start !== weekStart) return false
      const sClientId = (s as any).report_link_client_id || null
      return sClientId === targetClientId
    })
  }, [data, weekStart, selectedClient])
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
          continue
        }
        // v2.6.14 — Auto-fill numéro de semaine : si le field date n'a pas de jour mappé
        // mais que son dateFormat utilise WW (numéro semaine) → auto-fill avec weekStart
        // (= lundi de la semaine sélectionnée). Le format "Semaine WW" affichera "Semaine 20".
        const fmt = (f.dateFormat || '').toString()
        if (fmt.includes('WW')) {
          out[f.id] = weekStart
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
      // v2.5.0 — Scope par entreprise (multi-entreprise même semaine possible)
      const clientParam = selectedClient ? `&client=${selectedClient.id}` : ''
      fetch(`/api/reports/${slug}/save-draft?week=${weekStart}${clientParam}`)
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
    // Reset signature + état soumission pour la nouvelle semaine/entreprise
    setSignatureDataUrl(null)
    setSubmitted(false)
    // v2.5.0 — Recharge le draft quand l'entreprise change (multi-entreprise même semaine)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, state, slug, selectedClient?.id])

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
          // v2.5.0 — Scope par entreprise (multi-entreprise même semaine possible)
          report_link_client_id: selectedClient?.id || null,
        }),
      })
      if (r.ok) setSavedAt(new Date())
    } catch (e) {
      console.warn('[report] save-draft failed', e)
    }
  }, [slug, weekStart, weekDates.end, isLockedWeek, selectedClient])

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

  // v2.4.4 — handleSubmitWhatsApp retiré pour sécurité.
  // Le candidat ne peut plus envoyer le lien client via WhatsApp depuis son navigateur
  // (risque de transfert à un complice qui signerait à la place du vrai client).
  // Seul flow disponible : "Confirmer et envoyer" → POST submit → email automatique
  // au client_email pré-configuré dans report_link_clients.


  // ─── v2.3.x Bug 4 — Renvoyer la notif client (route /resend dédiée) ───
  const handleResendToClient = async () => {
    if (!submissionForWeek) return
    if (!confirm('Renvoyer la notification à l\'entreprise ? Le lien de signature reste valide 7 jours.')) return
    setResending(true)
    try {
      const r = await fetch(`/api/reports/${slug}/submissions/${submissionForWeek.id}/resend`, {
        method: 'POST',
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Notification renvoyée à l\'entreprise')
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
        <p style={{ ...textStyle, margin: 0 }}>Chargement du lien…</p>
        <Loader2 size={28} className="animate-spin" style={{ color: '#EAB308' }} />
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
          <p style={textStyle}>Il a été envoyé à l&apos;entreprise pour validation.</p>
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
  // v2.4.7 — Dédup : si une soumission non-draft existe pour (week, entreprise), masquer
  // les drafts orphelins (legacy report_link_client_id=NULL) sur la même semaine. Évite
  // l'affichage "Brouillon + En attente" pour la même semaine + même entreprise.
  const rawSubmissions = data.submissions || []
  const weeksWithFinal = new Set(
    rawSubmissions
      .filter(s => s.status !== 'draft' && s.status !== 'cancelled')
      .map(s => s.week_start),
  )
  const allMissions: MissionItem[] = rawSubmissions
    .filter(s => {
      const clientId = (s as any).report_link_client_id || null
      if (s.status !== 'draft') return true
      // Draft NULL orphelin sur une semaine qui a déjà une soumission validée → hide
      if (clientId === null && weeksWithFinal.has(s.week_start)) return false
      return true
    })
    .map(s => {
      const clientId = (s as any).report_link_client_id || null
      const resolvedClient = clientId ? clients.find(c => c.id === clientId) : null
      // v2.6.4 — calcule le numéro de semaine ISO pour l'affichage "S20 · ..."
      let weekNumber: number | null = null
      try { weekNumber = getWeekDates(s.week_start).weekNumber ?? null } catch { weekNumber = null }
      return {
        id: s.id,
        week_start: s.week_start,
        week_end: s.week_end,
        week_number: weekNumber,
        status: s.status,
        client_name: resolvedClient?.client_name || data.link?.client_name || null,
        report_link_client_id: clientId,
      }
    })
  const recentMissions = allMissions.slice(0, 3)
  // v2.6.5 — Historique = uniquement les rapports plus anciens que les 3 cards principales
  // (évite la duplication "tout est aussi dans l'historique")
  const olderMissions = allMissions.slice(3)
  const hasMoreHistory = olderMissions.length > 0

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

  // v2.6.0 — Supprimer un brouillon (uniquement status='draft')
  const handleDeleteDraft = async (m: MissionItem) => {
    if (m.status !== 'draft') return
    const wk = m.week_number ? `S${m.week_number}` : `${formatDateChDot(m.week_start).slice(0, 5)} → ${formatDateChDot(m.week_end).slice(0, 5)}`
    const entreprise = m.client_name ? ` (${m.client_name})` : ''
    if (!window.confirm(`Supprimer le brouillon ${wk}${entreprise} ?\n\nCette action est définitive.`)) return
    try {
      const r = await fetch(`/api/reports/${slug}/submissions/${m.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Erreur suppression')
      toast.success('Brouillon supprimé')
      // Refresh liste des submissions
      fetch(`/api/reports/${slug}`)
        .then(r => r.json())
        .then((nd: VerifyResponse) => { if (nd.valid) setData(nd) })
        .catch(() => {})
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    }
  }

  // v2.9.0 — Boutons flottants Mon compte + Déconnexion (visibles si auth_required, donc connecté)
  const handleCandidatLogout = async () => {
    try {
      await fetch('/api/portal-auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountType: 'candidat' }),
      })
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.replace('/report/login')
    }
  }
  // v2.9.6 — Icônes pures 32×32 (TOUS écrans). Libellés en tooltip uniquement.
  // Rendus dans le flow flex du header → plus de position:fixed qui chevauche
  // et plus de problème sur petits écrans. Sur les phases sans header (ex: form),
  // un wrapper sticky-top les rend visibles dans la page.
  const accountActions = (data?.link as any)?.auth_required ? (
    <>
      <a
        href="/report/account" title="Mon compte"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 99,
          background: '#FFFFFF', color: '#1C1A14', textDecoration: 'none',
          border: '1px solid #E5E7EB',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
      </a>
      <button
        onClick={handleCandidatLogout} title="Se déconnecter"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 99,
          background: '#FFFFFF', color: '#B91C1C',
          border: '1px solid #FCA5A5', cursor: 'pointer',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </>
  ) : null
  // Bandeau sticky-top pour les phases sans CandidatWelcomeHeader (ex: form)
  const accountStickyBar = accountActions ? (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: '#FAFAF7',
      padding: '10px 12px',
      display: 'flex', justifyContent: 'flex-end', gap: 6,
      borderBottom: '1px solid #F3F4F6',
    }}>
      {accountActions}
    </div>
  ) : null

  // v2.4.0 — Page accueil (landing) mobile-first
  if (phase === 'landing') {
    return (
      <div style={{
        minHeight: '100vh', overflowX: 'hidden',
        background: '#FAFAF7',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        paddingBottom: 100,
      }}>
        <CandidatWelcomeHeader prenom={candidatePrenomLanding} actions={accountActions} />
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

        {/* v2.6.1 — Section "Mes missions" : entreprises avec infos mission renseignées */}
        {clients.some(c => c.mission_contact_name || c.mission_phone || c.mission_start_date || c.mission_end_date) && (
          <>
            <div style={{ padding: '14px 16px 6px' }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#6B7280',
                marginBottom: 10,
              }}>
                Mes missions
              </div>
            </div>
            <MissionInfoList
              clients={clients}
              // v2.7.3 — Bug 2 A : ouvre un modal "Infos mission" au lieu de
              // basculer en formulaire. Le clic sur "Mes missions" ne doit pas
              // démarrer une saisie — c'est juste un récap des infos mission.
              onSelect={(c) => setMissionInfoClient(c)}
            />
          </>
        )}

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
        <MissionList items={recentMissions} onSelect={handleSelectMission} onDeleteDraft={handleDeleteDraft} emptyText="Aucun rapport pour le moment. Commencez par créer le premier !" />

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
              {showFullHistory ? 'Masquer l\'historique' : `Voir l\'historique (${olderMissions.length})`}
              <span style={{ fontSize: 12 }}>{showFullHistory ? '↑' : '→'}</span>
            </button>
          </div>
        )}
        {showFullHistory && (
          <div style={{ marginTop: 14 }}>
            <HistoryAccordion items={olderMissions} defaultOpenIndex={0} onSelect={handleSelectMission} onDeleteDraft={handleDeleteDraft} />
          </div>
        )}

        {/* v2.4.1 — Section Récapitulatif (collapsible)
            v2.4.7 — Affichée UNIQUEMENT si ≥ 1 rapport validé (status completed) — évite chiffres incomplets */}
        {allMissions.some(m => m.status === 'completed' || m.status === 'client_signed') && (
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

        {/* v2.7.3 — Modal "Infos mission" (clic sur card Mes missions) */}
        {missionInfoClient && (
          <MissionInfoModal
            client={missionInfoClient}
            onClose={() => setMissionInfoClient(null)}
          />
        )}
      </div>
    )
  }

  // v2.4.0 — Phase select_client (uniquement si ≥ 2 entreprises)
  if (phase === 'select_client') {
    return (
      <div style={{
        minHeight: '100vh', overflowX: 'hidden',
        background: '#FAFAF7',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        paddingBottom: 100,
      }}>
        {accountStickyBar}
        {/* v2.4.6 — Header avec logo officiel + bouton retour */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 4px' }}>
          <button
            type="button"
            onClick={() => setPhase('landing')}
            aria-label="Retour"
            style={{
              width: 40, height: 40, borderRadius: 10,
              border: '1px solid #E5E7EB', background: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#1C1A14',
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <LogoLAgence height={34} color="dark" />
        </div>
        <div style={{ padding: '6px 16px 10px' }}>
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

  // v2.6.2 — Map des fields bloqués (hors mission / déjà déclarés ailleurs)
  const weekDaysIso = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const blockedDays = buildBlockedDaysForWeek({
    weekDaysIso,
    missionStart: selectedClient?.mission_start_date || null,
    missionEnd: selectedClient?.mission_end_date || null,
    declaredByOthers,
    // v2.7.1 — Jours d'arrêt depuis la mission liée (désactivés visuellement)
    arrets: (data as any)?.mission_arrets || [],
  })
  const blockedFields = buildBlockedFieldsMap({
    fields: candidatFields,
    weekStart,
    blockedDays,
  })
  const blockedFieldIds = new Set(blockedFields.keys())

  // v2.7.3 — Fields auto-fill verrouillés en read-only : dates par jour (Lundi/.../Dimanche)
  // ET numéro de semaine (date avec dateFormat WW). Pilotés par le sélecteur de semaine
  // en haut → l'utilisateur ne peut PAS les modifier. Affichés via formatDate (respecte
  // field.dateFormat ex: "dd.MM") au lieu de l'input type=date natif (qui ignore dateFormat
  // ET tronque visuellement l'année dans les cellules étroites du tableau).
  const lockedFieldIds = new Set<string>()
  for (const f of candidatFields) {
    if (f.type !== 'date') continue
    // wizardSection peut être direct sur le field OU dans metadata (legacy templates)
    const wizardSection = f.wizardSection || (f.metadata?.wizardSection as string | undefined)
    const dayOffset = getDayOffsetFromSection(wizardSection)
    const isWeekNumberField = /W{1,2}/.test((f.dateFormat || '').toString())
    if (dayOffset !== null || isWeekNumberField) {
      lockedFieldIds.add(f.id)
    }
  }

  const canFinalize = !!signatureDataUrl
    && areAllRequiredFieldsFilled(candidatFields, values, signatureDataUrl, autoFill, blockedFieldIds)

  const fileUrl = activeDoc
    ? `/api/reports/${slug}/document?path=${encodeURIComponent(activeDoc.storage_path)}`
    : ''

  return (
    <div style={{
      minHeight: '100vh', overflowX: 'hidden',
      background: '#FAFAF7',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      paddingTop: 'env(safe-area-inset-top, 0)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* v2.9.7 — accountActions intégrés dans le header form à côté de l'Aide (voir plus bas) */}
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
        {/* v2.4.6 — Bloc identité : VRAI logo officiel (au lieu de l'icône jaune ClipboardList
            et du texte "L-AGENCE" approximatif). Conserve le sous-titre dynamique. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
          <LogoLAgence height={isMobile ? 30 : 36} color="dark" />
          <div style={{ minWidth: 0, display: isMobile && (selectedClient || candidateFullName) ? 'none' : 'block' }}>
            <div style={{
              fontSize: isMobile ? 10.5 : 11.5, color: '#6B7280',
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
              missionStart={selectedClient?.mission_start_date || null}
              missionEnd={selectedClient?.mission_end_date || null}
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
        {/* v2.9.7 — Mon compte + Déconnexion à droite de l'Aide (au lieu d'un bandeau sticky moche) */}
        {accountActions}
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
            missionStart={selectedClient?.mission_start_date || null}
            missionEnd={selectedClient?.mission_end_date || null}
          />
        </div>
      )}

      {/* v2.3.x Bug 2c — Bandeau dynamique selon status submission */}
      {isLockedWeek && submissionForWeek && (() => {
        const st = submissionForWeek.status
        const clientName = selectedClient?.client_name || data.link.client_name || 'l\'entreprise'
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
          // En attente entreprise : jaune + bouton renvoyer + bouton aperçu direct
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
                onClick={() => window.open(`/api/reports/${slug}/submissions/${submissionForWeek.id}/download?inline=1`, '_blank', 'noopener,noreferrer')}
                style={bannerBtnStyle('#A16207')}
              >
                <Eye size={12} />
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
              // v2.5.0 — Messages adaptés au contexte Rapport (en attente entreprise, pas signé final)
              completedTitle={
                submissionForWeek?.status === 'completed' || submissionForWeek?.status === 'client_signed'
                  ? 'Rapport validé !'
                  : 'Rapport envoyé !'
              }
              completedSubtitle={
                submissionForWeek?.status === 'completed' || submissionForWeek?.status === 'client_signed'
                  ? <>Votre rapport a été <strong>validé et signé par l&apos;entreprise</strong>. Une copie vous a été envoyée par email.</>
                  : <>Votre rapport a été envoyé à <strong>{selectedClient?.client_name || 'l\'entreprise'}</strong> pour validation et signature. Vous serez notifié dès qu&apos;elle aura signé.</>
              }
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
                    blockedFields={blockedFields}
                    lockedFields={lockedFieldIds}
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
                      blockedFields={blockedFields}
                      lockedFields={lockedFieldIds}
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
          v2.4.6 — Affiché UNIQUEMENT en mode 'document'. En mode 'wizard', le wizard a déjà
          son propre bouton "Confirmer et envoyer" sur la dernière étape (onFinalize). Doublon
          retiré pour éviter la confusion. La textarea note sera ré-intégrée au wizard plus tard. */}
      {!isLockedWeek && !submitted && viewMode === 'document' && (
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

          {/* v2.4.4 — Un seul bouton "Confirmer et envoyer au client par email" */}
          <button
            type="button"
            onClick={handleClickSubmit}
            disabled={submitting || !canFinalize}
            style={{
              width: '100%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 18px',
              fontSize: 15, fontWeight: 700,
              border: '1px solid #1C1A14', borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: (submitting || !canFinalize) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: (submitting || !canFinalize) ? 0.5 : 1,
              minHeight: 52,
            }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Confirmer et envoyer
          </button>
        </div>
      )}

      {/* v2.3.3 Bug 1 — Message post-envoi géré par early return (CenteredCard) au-dessus */}

      {/* v2.4.4 — Dialog confirmation simple. v2.4.7 — Email destinataire masqué (protection données) */}
      {confirmOpen && (
        <ConfirmDialog
          weekLabel={weekDates.label}
          weekNumber={weekDates.weekNumber}
          clientName={selectedClient?.client_name || data.link.client_name || ''}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleSubmit}
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

// ─── v2.4.4 — Dialog confirmation simple (envoi email auto uniquement) ────
// Le WhatsApp candidat a été retiré pour sécurité : le candidat ne peut pas
// rediriger le lien client vers un complice. Le client_email pré-configuré
// dans report_link_clients reçoit le lien automatiquement.

function ConfirmDialog({
  weekLabel, weekNumber, clientName, submitting, onCancel, onConfirm,
}: {
  weekLabel: string
  weekNumber: number
  clientName: string
  submitting: boolean
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
          maxWidth: 480, width: '100%',
          maxHeight: '92vh', overflow: 'auto',
          background: '#fff',
          borderRadius: 16, border: '1px solid #E5E7EB',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          padding: '24px 22px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <h2 style={{
          margin: 0,
          fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
          fontSize: 22, fontWeight: 400, color: '#1C1A14',
          letterSpacing: '-0.01em',
        }}>
          Vérifie la semaine avant d'envoyer
        </h2>

        {/* v2.6.17 — Semaine mise en avant pour contrôle visuel obligatoire */}
        <div style={{
          padding: '16px 18px',
          background: '#FEF3C7',
          border: '2px solid #FCD34D',
          borderRadius: 12,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Tu déclares les heures de
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1C1A14', fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif', lineHeight: 1.15 }}>
            Semaine {weekNumber}
          </div>
          <div style={{ fontSize: 14, color: '#78350F', fontWeight: 600, marginTop: 4 }}>
            {weekLabel}
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, margin: 0 }}>
          Si c'est la <strong>bonne semaine</strong>, clique sur <strong>Confirmer</strong> ci-dessous.
          {clientName ? <><br />Le rapport sera envoyé à <strong>{clientName}</strong> pour signature.</> : null}
        </p>

        <div style={{
          padding: '10px 12px',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: 10,
          fontSize: 12, color: '#991B1B', lineHeight: 1.5,
        }}>
          <strong>⚠️ Important :</strong> une fois signé, seul un administrateur peut corriger la semaine. Vérifie maintenant.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '10px 16px',
              fontSize: 13, fontWeight: 600,
              border: '1px solid #E5E7EB', borderRadius: 10,
              background: '#fff', color: '#6B7280',
              cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            style={{
              padding: '10px 18px',
              fontSize: 13.5, fontWeight: 700,
              border: '1px solid #1C1A14', borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
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
      minHeight: '100vh', overflowX: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: '#FAFAF7',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      gap: 18,
    }}>
      {/* v2.4.7 — Logo officiel en haut des pages de confirmation */}
      <LogoLAgence height={36} color="dark" />
      <div style={{
        maxWidth: 460, width: '100%', padding: 32,
        background: '#fff', border: '1px solid #E5E7EB',
        borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12,
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
