// TalentFlow Sign — Page PUBLIQUE de signature (Phase 3 — viewer DocuSign-like)
// v2.2.0 — Phase 3
// URL : /sign/v/{token}
// Layout : sidebar gauche (récap + liste documents) + viewer canvas central scroll vertical.
// Mobile-first : sidebar collapsable en drawer.
'use client'

import { useEffect, useState, use, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  FileSignature, FileText, AlertTriangle, Loader2, Clock, CheckCircle2,
  Menu as MenuIcon, X as XIcon, ChevronRight, PenLine, Check as CheckMark,
  ArrowRight, BookOpen, ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SignDocument } from '@/lib/sign/types'

const PublicPdfViewer = dynamic(() => import('@/components/sign/PublicPdfViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 8, color: '#6B7280' }}>
      <Loader2 size={18} className="animate-spin" />
      <span style={{ fontSize: 13 }}>Initialisation…</span>
    </div>
  ),
})
const ConsentModal = dynamic(() => import('@/components/sign/ConsentModal'), { ssr: false })
const SignaturePad = dynamic(() => import('@/components/sign/SignaturePad'), { ssr: false })
const SignWizard = dynamic(() => import('@/components/sign/SignWizard'), { ssr: false })
import PublicFieldsLayer, { areAllRequiredFieldsFilled, isFieldFilledExt } from '@/components/sign/PublicFieldsLayer'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

interface PageProps {
  params: Promise<{ token: string }>
}

interface VerifyResponse {
  valid: boolean
  reason?: 'not_found' | 'expired' | 'used' | 'envelope_not_found' | 'missing_token' | 'server_error'
  envelope?: {
    id: string
    title: string
    message: string | null
    status: string
    document_category: string
    sent_at: string | null
  }
  sender?: { name: string; email: string | null } | null
  recipient?: {
    name: string
    /** v2.2.1 — Prénom séparé saisi par l'admin (priorité sur le split de `name`) */
    firstName?: string | null
    /** v2.2.1 — Nom séparé saisi par l'admin (priorité sur le split de `name`) */
    lastName?: string | null
    email: string
    expires_at?: string | null
    terms_accepted_at?: string | null
    // Phase 4a-bis
    order?: number
    role?: string
    isCC?: boolean
    // Phase 4a
    signature_data_url?: string | null
    signature_method?: 'drawn' | 'typed' | 'auto' | null
    signed_at?: string | null
    field_values?: Record<string, unknown>
    // v2.2.2 — Mode d'affichage préféré pour ce destinataire
    preferredViewMode?: 'wizard' | 'document' | 'auto'
  }
  allRecipients?: Array<{
    name: string
    order: number
    role: string
    status: string
    signed_at: string | null
    isCurrent: boolean
  }>
  documents?: SignDocument[]
  // v2.2.0 Phase 4a-bis-2 — Mode Wizard
  wizard?: {
    enabled: boolean
    steps: WizardStep[]
  }
  // v2.2.0 Phase 4a-bis-5 — Données candidat lié pour pré-fill
  candidat?: {
    prenom?: string | null
    nom?: string | null
    email?: string | null
    telephone?: string | null
    date_naissance?: string | null
    localisation?: string | null
    /** v2.2.2 — Métier candidat → utilisé pour fields type=title */
    metier_recherche?: string | null
  } | null
  /** v2.2.2 — Nom de la société expéditrice → utilisé pour fields type=company */
  companyName?: string
}

const COMPANY = 'L-Agence SA'

export default function PublicSignPage({ params }: PageProps) {
  const { token } = use(params)
  const [state, setState] = useState<'loading' | 'invalid' | 'expired' | 'used' | 'ok' | 'error'>('loading')
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [activeDocIdx, setActiveDocIdx] = useState(0)
  const [scrollToPage, setScrollToPage] = useState<number | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [docPagesCount, setDocPagesCount] = useState<Record<number, number>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // v2.2.0 Phase 3 — Consentement CGU obligatoire avant viewer (style DocuSign "Vérifier et poursuivre")
  const [hasConsented, setHasConsented] = useState(false)
  // v2.2.0 Phase 4a — Signature électronique
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signatureMethod, setSignatureMethod] = useState<'drawn' | 'typed' | null>(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [completed, setCompleted] = useState(false)
  // v2.2.0 Phase 4a-bis — Valeurs des champs remplis (state local + sync DB debounced)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const fieldSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // v2.2.0 — Guidage SUIVANT : champ courant + flag "a démarré" + refs pour scroll
  const [currentFieldId, setCurrentFieldId] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const fieldElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const registerFieldEl = useCallback((fieldId: string, el: HTMLDivElement | null) => {
    if (el) fieldElsRef.current.set(fieldId, el)
    else fieldElsRef.current.delete(fieldId)
  }, [])
  // v2.2.0 Phase 4a-bis-2 — Mode d'affichage (wizard step-by-step ou overlay PDF)
  // Default : wizard sur mobile, document sur desktop, sauf si wizard désactivé
  const [viewMode, setViewMode] = useState<'wizard' | 'document'>('document')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // v2.2.0 Phase 4a-bis-2 — Auto-switch mode selon device + wizard_enabled
  // v2.2.2 — Priorité à la préférence destinataire (preferredViewMode), fallback auto
  //   - 'wizard'   : forcé wizard (si activé + steps présents, sinon fallback document)
  //   - 'document' : forcé document
  //   - 'auto' (défaut) : wizard sur mobile / document sur desktop
  // L'utilisateur peut toggle manuellement après.
  useEffect(() => {
    if (!data?.wizard) return
    const enabled = data.wizard.enabled !== false
    const hasSteps = (data.wizard.steps || []).length > 0
    const wizardAvailable = enabled && hasSteps
    const pref = data.recipient?.preferredViewMode || 'auto'
    if (pref === 'wizard' && wizardAvailable) {
      setViewMode('wizard')
    } else if (pref === 'document') {
      setViewMode('document')
    } else if (wizardAvailable && isMobile) {
      // 'auto' : wizard sur mobile uniquement
      setViewMode('wizard')
    } else {
      setViewMode('document')
    }
  }, [data?.wizard, data?.recipient, isMobile])

  useEffect(() => {
    fetch('/api/sign/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then((d: VerifyResponse) => {
        setData(d)
        if (d.valid) {
          setState('ok')
          // Phase 3 — Si déjà consenté côté DB, on skip le ConsentModal (refresh-friendly)
          if (d.recipient?.terms_accepted_at) {
            setHasConsented(true)
          }
          // Phase 4a — rehydrate la signature si déjà adoptée
          if (d.recipient?.signature_data_url) {
            setSignatureDataUrl(d.recipient.signature_data_url)
            setSignatureMethod((d.recipient.signature_method === 'drawn' || d.recipient.signature_method === 'typed')
              ? d.recipient.signature_method
              : null)
          }
          if (d.recipient?.signed_at) {
            setCompleted(true)
          }
          // Phase 4a-bis — rehydrate les valeurs des champs déjà saisies
          if (d.recipient?.field_values && typeof d.recipient.field_values === 'object') {
            setFieldValues(d.recipient.field_values)
          }
        }
        else if (d.reason === 'expired') setState('expired')
        else if (d.reason === 'used') setState('used')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [token])

  const documents = useMemo(() => data?.documents || [], [data])
  const activeDoc = documents[activeDocIdx]
  const senderDisplayName = data?.sender?.name || COMPANY

  // Reset page when changing doc
  useEffect(() => {
    setCurrentPage(1)
    setScrollToPage(1)
  }, [activeDocIdx])

  // ─── Phase 4a-bis — Hooks calcul fields (DOIVENT rester AVANT les early returns) ───
  const recipientOrder = data?.recipient?.order ?? 1
  const recipientName = data?.recipient?.name || ''
  const recipientEmail = data?.recipient?.email || ''
  const isCC = data?.recipient?.isCC === true
  const nameParts = recipientName.trim().split(/\s+/)
  const fallbackFirst = nameParts[0] || ''
  const fallbackLast = nameParts.slice(1).join(' ') || ''
  const today = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // v2.2.0 Phase 4a-bis-5 — Pré-fill prénom / nom dans l'ordre de priorité :
  //   1. firstName/lastName saisis par l'admin sur le destinataire (v2.2.1)
  //   2. infos candidat lié (si enveloppe.candidate_id)
  //   3. split du recipient_name (fallback)
  const candidat = data?.candidat
  const adminFirst = data?.recipient?.firstName || ''
  const adminLast = data?.recipient?.lastName || ''
  const firstName = adminFirst || candidat?.prenom || fallbackFirst
  const lastName = adminLast || candidat?.nom || fallbackLast
  const fullName = (adminFirst || adminLast)
    ? [adminFirst, adminLast].filter(Boolean).join(' ').trim()
    : candidat
      ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() || recipientName
      : recipientName

  // v2.2.2 — companyName depuis verify-token (priorité override context_data > sender.entreprise > fallback)
  // title (fonction professionnelle) depuis candidat.metier_recherche
  const senderCompanyName = data?.companyName || ''
  const candidatTitle = candidat?.metier_recherche || ''

  const autoFill = useMemo(() => ({
    firstName, lastName, fullName, email: recipientEmail, today,
    // v2.2.2 — pré-fill auto pour fields type=company / type=title
    companyName: senderCompanyName,
    title: candidatTitle,
    // Champs supplémentaires utilisables par les fields type=text qui ressemblent à téléphone/DDN/...
    telephone: candidat?.telephone || '',
    dateNaissance: candidat?.date_naissance || '',
    localisation: candidat?.localisation || '',
  }), [firstName, lastName, fullName, recipientEmail, today, senderCompanyName, candidatTitle,
       candidat?.telephone, candidat?.date_naissance, candidat?.localisation])

  const recipientPalette = RECIPIENT_COLORS[Math.max(0, (recipientOrder - 1) % RECIPIENT_COLORS.length)]

  const fieldsForCurrentRecipient = useMemo(() => {
    if (!activeDoc) return []
    return (activeDoc.fields || []).filter(f => f.recipientOrder === recipientOrder)
  }, [activeDoc, recipientOrder])

  const canFinalize = useMemo(() => {
    if (isCC) return true
    const allRecipientFields = documents.flatMap(d =>
      (d.fields || []).filter(f => f.recipientOrder === recipientOrder)
    )
    return areAllRequiredFieldsFilled(allRecipientFields, fieldValues, signatureDataUrl, autoFill)
  }, [documents, recipientOrder, fieldValues, signatureDataUrl, autoFill, isCC])

  // v2.2.0 — Liste ordonnée des champs requis non-remplis (signature exclue ici, gérée à part)
  // Ordre lecture document : doc → page → y → x
  const nextFieldsQueue = useMemo(() => {
    const queue: Array<{ fieldId: string; docIdx: number; page: number }> = []
    documents.forEach((doc, dIdx) => {
      const fields = (doc.fields || [])
        .filter(f => f.recipientOrder === recipientOrder && !f.metadata?.hidden)
        .filter(f => f.type !== 'annotation')
        .filter(f => f.required || f.type === 'signature' || f.type === 'initial')
        .filter(f => !isFieldFilledExt(f, fieldValues[f.id], signatureDataUrl, autoFill))
        .sort((a, b) => (a.page - b.page) || (a.y - b.y) || (a.x - b.x))
      fields.forEach(f => queue.push({ fieldId: f.id, docIdx: dIdx, page: f.page }))
    })
    return queue
  }, [documents, recipientOrder, fieldValues, signatureDataUrl, autoFill])

  // v2.2.0 — Aller au prochain champ (scroll + focus + halo)
  const goToNextField = useCallback(() => {
    setHasStarted(true)
    // Champ signature pas encore signé → ouvre directement le SignaturePad
    const firstSignature = nextFieldsQueue.find(q => {
      const doc = documents[q.docIdx]
      const f = doc?.fields?.find(ff => ff.id === q.fieldId)
      return f && (f.type === 'signature' || f.type === 'initial') && !signatureDataUrl
    })
    // Si la prochaine étape logique est de signer ET aucun autre champ non-rempli avant → SignaturePad
    if (firstSignature && nextFieldsQueue[0]?.fieldId === firstSignature.fieldId) {
      setSignaturePadOpen(true)
      setCurrentFieldId(firstSignature.fieldId)
      return
    }
    const next = nextFieldsQueue[0]
    if (!next) {
      setCurrentFieldId(null)
      return
    }
    // Si dans un autre document → switcher
    if (next.docIdx !== activeDocIdx) {
      setActiveDocIdx(next.docIdx)
    }
    setCurrentFieldId(next.fieldId)
    setScrollToPage(next.page)
    // Scroll précis vers l'élément (après le rendu de la page)
    setTimeout(() => {
      const el = fieldElsRef.current.get(next.fieldId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 350)
  }, [nextFieldsQueue, documents, signatureDataUrl, activeDocIdx])

  const syncFieldValues = useCallback((values: Record<string, unknown>) => {
    if (fieldSyncTimerRef.current) clearTimeout(fieldSyncTimerRef.current)
    fieldSyncTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/sign/sign-field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, fieldValues: values }),
        })
      } catch (e) {
        console.warn('[sign/v] sync field_values error', e)
      }
    }, 600)
  }, [token])

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setFieldValues(prev => {
      const next = { ...prev, [fieldId]: value }
      syncFieldValues(next)
      return next
    })
  }, [syncFieldValues])

  // ── ÉTATS D'ERREUR ──────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <CenteredCard>
        <Loader2 size={28} className="animate-spin" style={{ color: '#EAB308' }} />
        <p style={{ ...textStyle, marginTop: 16 }}>Vérification du lien…</p>
      </CenteredCard>
    )
  }
  if (state === 'invalid' || state === 'error') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><AlertTriangle size={28} /></div>
        <h1 style={titleStyle}>Lien invalide</h1>
        <p style={textStyle}>
          Ce lien de signature n&apos;existe pas ou a été révoqué. Contactez {COMPANY} si besoin.
        </p>
      </CenteredCard>
    )
  }
  if (state === 'expired') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEF3C7', '#D97706')}><Clock size={28} /></div>
        <h1 style={titleStyle}>Lien expiré</h1>
        <p style={textStyle}>
          Ce lien a expiré. Demandez un nouveau lien à {COMPANY}.
        </p>
      </CenteredCard>
    )
  }
  if (state === 'used') {
    return (
      <CenteredCard>
        <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={28} /></div>
        <h1 style={titleStyle}>Document déjà signé</h1>
        <p style={textStyle}>
          Ce document a déjà été signé. Une copie vous a été envoyée par email.
        </p>
      </CenteredCard>
    )
  }

  // ── ÉTAT OK : layout principal ──────────────────────────────────────────────
  const envelope = data?.envelope
  const recipient = data?.recipient

  const fileUrl = activeDoc
    ? `/api/sign/document/${token}?path=${encodeURIComponent(activeDoc.storage_path)}`
    : ''

  // Sidebar contenu (réutilisé desktop + mobile drawer)
  const sidebarContent = (
    <>
      {/* Header TalentFlow Sign — l'application (pas l'entreprise) */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: '#EAB308',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <FileSignature size={17} style={{ color: '#1C1A14' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#1C1A14', lineHeight: 1.1,
          }}>
            TalentFlow Sign
          </div>
          <div style={{ fontSize: 10.5, color: '#6B7280', letterSpacing: '0.04em', marginTop: 2 }}>
            Signature électronique
          </div>
        </div>
      </div>

      {/* Récap expéditeur */}
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #E5E7EB' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 999,
          background: '#FEF3C7', border: '1px solid rgba(234,179,8,0.25)',
          color: '#A16207',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>
          {senderDisplayName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280' }}>
            De
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#1C1A14',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {senderDisplayName}
          </div>
        </div>
      </div>

      {/* Recipient */}
      {recipient && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 4 }}>
            Destinataire
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1A14' }}>
            {recipient.name}
          </div>
          <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2, wordBreak: 'break-word' }}>
            {recipient.email}
          </div>
        </div>
      )}

      {/* Message */}
      {envelope?.message && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 4 }}>
            Message
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#1C1A14', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {envelope.message}
          </p>
        </div>
      )}

      {/* Documents list */}
      <div style={{ padding: '14px 0 8px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', padding: '0 18px 8px' }}>
          Documents ({documents.length})
        </div>
        {documents.map((d, i) => {
          const active = i === activeDocIdx
          const pageCount = docPagesCount[i]
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => {
                  setActiveDocIdx(i)
                  if (isMobile) setSidebarOpen(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 18px',
                  background: active ? '#FEF3C7' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${active ? '#EAB308' : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}
              >
                <FileText size={14} style={{ color: active ? '#A16207' : '#6B7280', marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#1C1A14' : '#374151',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>
                    {d.name}
                  </div>
                  {pageCount && pageCount > 0 && (
                    <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>
                      {pageCount} page{pageCount > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {active && <ChevronRight size={12} style={{ color: '#EAB308', marginTop: 4, flexShrink: 0 }} />}
              </button>
              {/* Pages list (only for active doc) */}
              {active && pageCount && pageCount > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 18px 8px 36px' }}>
                  {Array.from({ length: pageCount }, (_, p) => {
                    const pageNum = p + 1
                    const isCurrent = currentPage === pageNum
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setScrollToPage(pageNum)}
                        style={{
                          minWidth: 28, height: 24,
                          padding: '0 6px',
                          fontSize: 11, fontWeight: 600,
                          border: `1px solid ${isCurrent ? '#EAB308' : '#E5E7EB'}`,
                          background: isCurrent ? '#EAB308' : '#fff',
                          color: isCurrent ? '#1C1A14' : '#6B7280',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid #E5E7EB', background: '#FAFAF7' }}>
        {recipient?.expires_at && (
          <div style={{ fontSize: 10.5, color: '#6B7280', marginBottom: 4 }}>
            Lien valable jusqu&apos;au {formatDate(recipient.expires_at)}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileSignature size={10} />
          Sécurisé par TalentFlow Sign
        </div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
          Envoyé par {COMPANY}
        </div>
      </div>
    </>
  )

  // ─── Phase 4a — Handlers signature ───
  const handleSignatureAdopted = async (dataUrl: string, method: 'drawn' | 'typed') => {
    setSignatureDataUrl(dataUrl)
    setSignatureMethod(method)
    setSignaturePadOpen(false)
    // Persiste tout de suite côté DB (bénéfice : si fermeture browser, signature sauvée)
    try {
      const r = await fetch('/api/sign/sign-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signatureDataUrl: dataUrl, method }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erreur')
      toast.success('Signature adoptée — appliquée à tous les champs')
      // Enchaîne au champ suivant non-rempli (laisse le state se mettre à jour avant)
      setHasStarted(true)
      setTimeout(() => { goToNextField() }, 250)
    } catch (e: any) {
      toast.error(e.message || 'Erreur enregistrement signature')
    }
  }

  const handleFinalize = async () => {
    if (!signatureDataUrl) {
      // Si pas encore signé, ouvre le SignaturePad
      setSignaturePadOpen(true)
      return
    }
    if (finalizing) return
    if (!confirm('Finaliser la signature ? Cette action est définitive.')) return
    setFinalizing(true)
    try {
      const r = await fetch('/api/sign/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erreur')
      setCompleted(true)
      toast.success(d.completed
        ? 'Document signé par tous les destinataires !'
        : 'Votre signature a été enregistrée'
      )
    } catch (e: any) {
      toast.error(e.message || 'Erreur finalisation')
    } finally {
      setFinalizing(false)
    }
  }

  // ─── ConsentModal bloquant tant que pas accepté (sauf si déjà signé/expiré) ───
  // Le viewer reste rendu en arrière-plan (UX cohérente DocuSign : on voit qu'il y a
  // bien un document, le modal demande juste l'acceptation des CGU avant de l'examiner).
  const showConsent = !hasConsented

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      background: '#FAFAF7',
      overflow: 'hidden',
    }}>
      {/* ConsentModal — Phase 3 (bloquant pré-viewer) */}
      {showConsent && envelope && recipient && (
        <ConsentModal
          open
          token={token}
          senderName={senderDisplayName}
          recipientName={recipient.name}
          recipientEmail={recipient.email}
          envelopeTitle={envelope.title}
          isCC={envelope.document_category === 'autres' && false /* TODO Phase 4 : détecter rôle CC depuis token */}
          onAccepted={() => setHasConsented(true)}
        />
      )}

      {/* SignaturePad — Phase 4a (modal canvas tracé / typed) */}
      {recipient && (
        <SignaturePad
          open={signaturePadOpen}
          defaultName={recipient.name}
          onClose={() => setSignaturePadOpen(false)}
          onAdopt={handleSignatureAdopted}
        />
      )}

      {/* Sidebar desktop */}
      {!isMobile && (
        <aside style={{
          width: 280, flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column',
          height: '100vh', overflow: 'hidden',
        }}>
          {sidebarContent}
        </aside>
      )}

      {/* Sidebar mobile drawer */}
      {isMobile && sidebarOpen && (
        <>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
            }}
          />
          <aside style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
            width: 'min(85vw, 320px)',
            background: '#fff', borderRight: '1px solid #E5E7EB',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '4px 0 20px rgba(0,0,0,0.18)',
          }}>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 1,
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Fermer le menu"
            >
              <XIcon size={16} />
            </button>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main viewer */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
          minHeight: 56,
        }}>
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
              aria-label="Ouvrir le menu"
            >
              <MenuIcon size={18} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: '#A16207', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <FileSignature size={11} />
              Document à signer
            </div>
            <h1 style={{
              margin: 0, marginTop: 2,
              fontSize: isMobile ? 15 : 17,
              fontWeight: 700,
              color: '#1C1A14',
              lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {envelope?.title}
            </h1>
          </div>

          {/* Toggle Mode Wizard ↔ Document — visible uniquement si wizard activé */}
          {hasConsented && !completed && data?.wizard?.enabled && (data?.wizard?.steps?.length || 0) > 0 && (
            <button
              type="button"
              onClick={() => setViewMode(m => m === 'wizard' ? 'document' : 'wizard')}
              title={viewMode === 'wizard' ? 'Voir le document complet' : 'Voir le mode wizard guidé'}
              style={{
                flexShrink: 0,
                padding: isMobile ? '6px 10px' : '7px 12px',
                fontSize: 11.5,
                fontWeight: 600,
                border: '1px solid #E5E7EB',
                borderRadius: 999,
                background: '#fff',
                color: '#6B7280',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
              }}
            >
              {viewMode === 'wizard' ? <FileText size={11} /> : <ListChecks size={11} />}
              {viewMode === 'wizard' ? 'Document' : 'Wizard'}
            </button>
          )}

          {/* Bouton "Suivant" en haut — guide le candidat de champ en champ (mode document uniquement)
              Disparaît quand tous les champs sont remplis (Terminer prend le relais) */}
          {viewMode === 'document' && hasConsented && !completed && !isCC && nextFieldsQueue.length > 0 && (
            <button
              type="button"
              onClick={goToNextField}
              style={{
                flexShrink: 0,
                padding: isMobile ? '8px 12px' : '10px 16px',
                fontSize: isMobile ? 12.5 : 13,
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid #1C1A14',
                borderRadius: 8,
                background: '#EAB308',
                color: '#1C1A14',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                animation: hasStarted ? undefined : 'tf-sign-pulse-btn 1.6s ease-in-out infinite',
              }}
            >
              {!hasStarted ? 'Commencer' : 'Suivant'}
              <ArrowRight size={isMobile ? 13 : 14} strokeWidth={2.5} />
            </button>
          )}

          {/* CTA "Terminer" (Phase 4a-bis) — disabled tant que tous les champs requis ne sont pas remplis (mode document uniquement) */}
          {viewMode === 'document' && hasConsented && !completed && (
            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing || !canFinalize}
              title={!canFinalize ? 'Remplissez tous les champs requis et signez avant de terminer' : 'Finaliser la signature'}
              style={{
                flexShrink: 0,
                padding: isMobile ? '8px 12px' : '10px 16px',
                fontSize: isMobile ? 12.5 : 13,
                fontWeight: 700,
                border: `1px solid ${canFinalize ? '#1C1A14' : '#D1D5DB'}`,
                borderRadius: 8,
                background: canFinalize ? '#f59e0b' : '#E5E7EB',
                color: canFinalize ? '#000' : '#9CA3AF',
                cursor: !canFinalize ? 'not-allowed' : (finalizing ? 'wait' : 'pointer'),
                opacity: finalizing ? 0.7 : 1,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {finalizing
                ? <Loader2 size={14} className="animate-spin" />
                : <CheckMark size={14} />
              }
              Terminer
            </button>
          )}
        </header>
        <style jsx global>{`
          @keyframes tf-sign-pulse-btn {
            0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0.5); }
            50%      { box-shadow: 0 0 0 6px rgba(234,179,8,0); }
          }
        `}</style>

        {/* État signature — bandeau dynamique (1 ligne, white-space nowrap mobile-safe) */}
        {viewMode === 'document' && hasConsented && (
          <div style={{
            flexShrink: 0,
            padding: '8px 12px',
            background: completed ? '#D1FAE5' : canFinalize ? '#DBEAFE' : '#FEF3C7',
            borderBottom: `1px solid ${completed ? 'rgba(16,185,129,0.3)' : canFinalize ? 'rgba(59,130,246,0.3)' : 'rgba(234,179,8,0.3)'}`,
            fontSize: isMobile ? 11.5 : 12,
            color: completed ? '#065F46' : canFinalize ? '#1E40AF' : '#713F12',
            textAlign: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            lineHeight: 1.3,
          }}>
            {completed ? (
              <>
                <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                <span>Document signé — copie envoyée par email</span>
              </>
            ) : canFinalize ? (
              <>
                <CheckMark size={12} style={{ flexShrink: 0 }} />
                <span>Tous les champs sont remplis — cliquez sur <strong>Terminer</strong></span>
              </>
            ) : !hasStarted ? (
              <>
                <BookOpen size={12} style={{ flexShrink: 0 }} />
                <span><strong>Lisez le document</strong>, puis cliquez sur <strong>Commencer</strong></span>
              </>
            ) : (
              <>
                <PenLine size={12} style={{ flexShrink: 0 }} />
                <span>Cliquez sur <strong>Suivant</strong> pour passer au prochain champ</span>
              </>
            )}
          </div>
        )}

        {/* v2.2.0 Phase 4a-bis-2 — Mode WIZARD : remplace le PDF viewer */}
        {viewMode === 'wizard' && hasConsented && data?.wizard && data.wizard.steps.length > 0 ? (
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <SignWizard
              steps={data.wizard.steps}
              documents={documents}
              fieldValues={fieldValues}
              onValueChange={handleFieldChange}
              signatureDataUrl={signatureDataUrl}
              onRequestSignature={() => setSignaturePadOpen(true)}
              autoFill={autoFill}
              recipientName={recipientName}
              envelopeTitle={envelope?.title || ''}
              completed={completed}
              finalizing={finalizing}
              onFinalize={handleFinalize}
              onSwitchToDocumentMode={() => setViewMode('document')}
              token={token}
              contextData={(envelope as unknown as { context_data?: { weekStartDate?: string | null } | null })?.context_data || null}
            />
          </div>
        ) : documents.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40, color: '#6B7280',
          }}>
            <div style={{ textAlign: 'center' }}>
              <FileText size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1A14' }}>Aucun document</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>L&apos;expéditeur n&apos;a pas joint de PDF.</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <PublicPdfViewer
              key={fileUrl}
              url={fileUrl}
              scrollToPage={scrollToPage}
              onLoad={(num) => {
                setDocPagesCount(prev => ({ ...prev, [activeDocIdx]: num }))
              }}
              onPageChange={(p) => setCurrentPage(p)}
              renderPageOverlay={!completed ? (pageNum, sizePx) => (
                <PublicFieldsLayer
                  page={pageNum}
                  sizePx={sizePx}
                  fields={fieldsForCurrentRecipient}
                  values={fieldValues}
                  onValueChange={handleFieldChange}
                  signatureDataUrl={signatureDataUrl}
                  onRequestSignature={() => setSignaturePadOpen(true)}
                  recipientColor={recipientPalette}
                  autoFill={autoFill}
                  currentFieldId={currentFieldId}
                  registerFieldEl={registerFieldEl}
                />
              ) : undefined}
            />
          </div>
        )}

        {/* Footer compact CGU (style DocuSign) — visible quand consenté en mode document uniquement */}
        {viewMode === 'document' && hasConsented && (
          <footer style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: '#F8F7F2',
            borderTop: '1px solid #E5E7EB',
            fontSize: 11,
            color: '#6B7280',
            minHeight: 36,
            flexWrap: 'wrap',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#15803D', fontWeight: 600 }}>
              <CheckCircle2 size={11} />
              CGU acceptées
            </span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <FileSignature size={11} />
              Document sécurisé par TalentFlow Sign
            </span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span>Conforme ZertES (signature électronique simple suisse)</span>
          </footer>
        )}
      </main>
    </div>
  )
}

// ─────────── Helpers ───────────
function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: '#FAFAF7',
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return iso || ''
  }
}
