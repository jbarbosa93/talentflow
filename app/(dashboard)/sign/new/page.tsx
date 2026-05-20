// TalentFlow Sign — Page création enveloppe full-screen (refonte v2.2.1)
// Remplace le modal CreateEnvelopeModal pour une UX style DocuSign.
//
// Sections : Titre/Catégorie/Template → Documents → Destinataires → Message → Avancé
// Header sticky avec Annuler / Enregistrer brouillon / Envoyer.
// Query params : ?candidatId=xxx&category=yyy → pré-fill 1er destinataire
'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  X, Save, Send, Loader2, FileSignature, Users, FileText,
  MessageSquare, ListOrdered, Plus, Sparkles, Move,
} from 'lucide-react'
import DocumentUploader from '@/components/sign/DocumentUploader'
import { type RecipientCandidat, FirstNameAutocomplete, PhoneInput } from '@/components/sign/RecipientCard'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'
import RecipientsGroup from '@/components/sign/RecipientsGroup'
import AdvancedOptions, { DEFAULT_OPTIONS, type AdvancedOptionsValue } from '@/components/sign/AdvancedOptions'
import type { SignCategory, SignDocument, SignTemplate } from '@/lib/sign/types'
import { createClient } from '@/lib/supabase/client'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import { looksLikeCompanyField } from '@/lib/sign/field-helpers'
import { Edit3 } from 'lucide-react'

export default function SignNewPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SignNewPage />
    </Suspense>
  )
}

function SignNewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const candidatIdParam = searchParams.get('candidatId') || ''
  const categoryParam = (searchParams.get('category') as SignCategory | null) || 'autres'
  const templateParam = searchParams.get('template') || ''
  // v2.2.2 — Édition d'un brouillon existant (depuis bouton Modifier sur /sign/[id])
  const draftIdParam = searchParams.get('draft') || ''

  // ── State formulaire ──
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<SignCategory>(categoryParam)
  const [templateId, setTemplateId] = useState<string>(templateParam)
  const [templates, setTemplates] = useState<SignTemplate[]>([])
  const [documents, setDocuments] = useState<SignDocument[]>([])
  const [recipients, setRecipients] = useState<RecipientCandidat[]>([
    { name: '', email: '', role: 'signer', order: 0, status: 'pending', signed_at: null },
  ])
  const [orderEnabled, setOrderEnabled] = useState(true)
  // v2.8.6 — Subject email auto-généré depuis le Titre + nombre de docs.
  // Champ "Objet" UI supprimé (jamais utilisé, code mort).
  const [message, setMessage] = useState('')
  // v2.8.6 — Profile du user courant (pour le bouton « Moi » auto-fill destinataire)
  const [me, setMe] = useState<{ firstName: string; lastName: string; email: string; phone?: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return
      const meta = (user.user_metadata || {}) as { prenom?: string; nom?: string; telephone?: string; phone?: string }
      setMe({
        firstName: meta.prenom || '',
        lastName: meta.nom || '',
        email: user.email || '',
        phone: meta.telephone || meta.phone || '',
      })
    })
    return () => { cancelled = true }
  }, [])
  const [advanced, setAdvanced] = useState<AdvancedOptionsValue>(DEFAULT_OPTIONS)
  const [submitting, setSubmitting] = useState<'send' | 'draft' | 'preview' | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  // v2.2.1 — Mode "rôles fixés" du template (default true si template a un schema avec ≥1 rôle)
  const [useTemplateRoles, setUseTemplateRoles] = useState(true)
  // v2.2.2 — Nombre de rôles définis par le template (les destinataires ajoutés au-delà
  // sont des CC libres, supprimables, qui ne sont pas dans le schema du template).
  const [templateRoleCount, setTemplateRoleCount] = useState(0)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Charge templates (kind='report' exclus — réservés aux Rapports) ──
  useEffect(() => {
    fetch('/api/sign/templates').then(r => r.json()).then(d => setTemplates((d.templates || []).filter((t: SignTemplate) => t.kind !== 'report'))).catch(() => {})
  }, [])

  // ── Pré-fill candidat depuis query param ──
  useEffect(() => {
    if (!candidatIdParam) return
    fetch(`/api/candidats/${candidatIdParam}`).then(r => r.json()).then(d => {
      if (d.candidat) {
        const c = d.candidat
        const fullName = [c.prenom, c.nom].filter(Boolean).join(' ').trim()
        // v2.9.23 — Pré-remplit aussi prénom / nom / téléphone (le bouton
        // « Envoyer à signer » de la fiche candidat ouvre cette page).
        setRecipients(prev => prev.map((r, i) => i === 0 ? {
          ...r,
          name: fullName,
          firstName: c.prenom || '',
          lastName: c.nom || '',
          email: c.email || '',
          phone: c.telephone || '',
          roleName: 'Candidat',
          candidat_id: c.id,
        } : r))
      }
    }).catch(() => {})
  }, [candidatIdParam])

  // ── v2.2.2 — Pré-fill enveloppe depuis brouillon existant (?draft=ID) ──
  useEffect(() => {
    if (!draftIdParam) return
    fetch(`/api/sign/envelopes/${draftIdParam}`).then(r => r.json()).then(d => {
      const env = d.envelope
      if (!env) return
      if (env.status !== 'draft') {
        toast.error('Cette enveloppe n\'est plus un brouillon — édition impossible')
        router.replace(`/sign/${draftIdParam}`)
        return
      }
      setTitle(env.title || '')
      setCategory((env.document_category as SignCategory) || 'autres')
      setTemplateId(env.template_id || '')
      setMessage(env.message || '')
      // documents : si l'enveloppe a son propre array (cas pas de template) → l'utiliser ;
      // sinon (avec template) le useEffect templates fera son job au chargement
      if ((env.documents || []).length > 0 && !env.template_id) {
        setDocuments(env.documents)
      }
      // recipients
      if (Array.isArray(env.recipients) && env.recipients.length > 0) {
        setRecipients(env.recipients.map((r: any) => ({
          name: r.name || '',
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email || '',
          role: r.role || 'signer',
          roleName: r.roleName,
          order: r.order ?? 0,
          status: r.status || 'pending',
          signed_at: r.signed_at || null,
          preferredViewMode: r.preferredViewMode || 'auto',
        })))
      }
      // Options avancées
      const ctx = env.context_data || {}
      setAdvanced(prev => ({
        ...prev,
        expiresInDays: env.expires_in_days ?? prev.expiresInDays,
        reminderFrequencyDays: env.reminder_frequency_days ?? prev.reminderFrequencyDays,
        expiryWarningDays: env.expiry_warning_days ?? prev.expiryWarningDays,
        weekStartDate: typeof ctx.weekStartDate === 'string' ? ctx.weekStartDate : prev.weekStartDate,
        companyName: typeof ctx.companyName === 'string' ? ctx.companyName : prev.companyName,
      }))
    }).catch(() => toast.error('Erreur de chargement du brouillon'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdParam])

  // ── Quand template sélectionné : copie ses docs + recipients_schema ──
  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === templateId) || null,
    [templates, templateId],
  )
  // v2.8.0 — Template "contrat" : upload override autorisé (PDF différent à
  // chaque envoi). Les fields signature du template sont copiés sur le PDF
  // uploadé au moment du submit, en gardant les coords proportionnelles A4.
  const isContractTemplate = selectedTemplate?.template_category === 'contrat'

  useEffect(() => {
    if (!selectedTemplate) return
    // v2.8.0 — On charge toujours les docs du template (vide ou pas) :
    // - Template contrat vierge → documents = [] → user upload son PDF du jour
    // - Template contrat ad-hoc (chargé via ?draft=) → contient déjà le PDF du jour
    // - Autre template → ses PDFs modèles (comportement historique)
    // Le user peut supprimer + ré-uploader dans le DocumentUploader si besoin.
    setDocuments(selectedTemplate.documents || [])

    // v2.8.0 — Déduire la catégorie de l'enveloppe depuis template_category.
    // Mapping : 'contrat' → 'contrat', 'mappe' → 'mappe', sinon 'autres'.
    const tplCat = selectedTemplate.template_category
    if (tplCat === 'contrat') setCategory('contrat')
    else if (tplCat === 'mappe') setCategory('mappe')
    else setCategory('autres')

    // v2.2.2 — Dérivation des rôles depuis l'union de TROIS sources :
    //   1. recipients_schema (rôles déclarés par l'admin)
    //   2. documents[].fields[].recipientOrder (rôles utilisés par des champs)
    //   3. wizard_steps[].recipientOrder (rôles utilisés par des étapes wizard)
    // v2.8.0 — Bug fix : avant `s.order > 0` excluait order=0 → si l'user
    // ajoutait des rôles dans l'éditeur (order 0, 1, 2...), seuls 1+ étaient
    // visibles dans /sign/new. Maintenant on accepte order >= 0.
    const derivedOrders = new Set<number>()
    for (const s of (selectedTemplate.recipients_schema || [])) {
      if (typeof s.order === 'number' && s.order >= 0) derivedOrders.add(s.order)
    }
    for (const d of (selectedTemplate.documents || [])) {
      for (const f of (d.fields || [])) {
        if (typeof f.recipientOrder === 'number' && f.recipientOrder >= 0) derivedOrders.add(f.recipientOrder)
      }
    }
    const wSteps = (selectedTemplate as unknown as { wizard_steps?: { recipientOrder?: number }[] }).wizard_steps || []
    for (const s of wSteps) {
      if (typeof s.recipientOrder === 'number' && s.recipientOrder >= 0) derivedOrders.add(s.recipientOrder)
    }
    const sortedOrders = Array.from(derivedOrders).sort((a, b) => a - b)
    // Fallback : aucun rôle détecté → 1 rôle par défaut (order=0)
    if (sortedOrders.length === 0) sortedOrders.push(0)

    setUseTemplateRoles(true)
    setTemplateRoleCount(sortedOrders.length)
    setRecipients(prev => {
      return sortedOrders.map((order, idx) => {
        const existing = prev[idx]
        const schemaItem = (selectedTemplate.recipients_schema || []).find(s => s.order === order)
        return {
          name: existing?.name || schemaItem?.name || '',
          firstName: (existing as any)?.firstName,
          lastName: (existing as any)?.lastName,
          email: existing?.email || schemaItem?.email || '',
          role: schemaItem?.role === 'cc' ? 'cc' : 'signer',
          roleName: schemaItem?.roleName || existing?.roleName || `Rôle ${order}`,
          order,
          status: 'pending',
          signed_at: null,
          // v2.2.2 — Hérite du mode défaut défini sur le template, override possible par l'admin
          preferredViewMode: (existing as any)?.preferredViewMode || (schemaItem as any)?.preferredViewMode || 'auto',
        }
      })
    })
    // Auto-fill titre si vide
    if (!title.trim()) {
      setTitle(selectedTemplate.name)
    }
    // v2.8.6 — Auto-fill Message si vide depuis default_message du template
    const tplDefaultMessage = (selectedTemplate as unknown as { default_message?: string | null }).default_message
    if (tplDefaultMessage && !message.trim()) {
      setMessage(tplDefaultMessage)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate])

  // v2.8.0 — Le lock n'est PAS appliqué aux templates contrat (upload override autorisé)
  const isTemplateLocked = !!selectedTemplate && !isContractTemplate

  // v2.2.4 — Détecte si le template sélectionné contient un field destiné à
  // recevoir le nom d'une société cliente (type=company ou label/tooltip matchant).
  // Basé sur selectedTemplate uniquement (pas les docs manuels) : le companyName
  // n'auto-remplit les champs que quand un template est actif.
  const hasCompanyField = useMemo(() => {
    if (!selectedTemplate) return false
    for (const d of selectedTemplate.documents) {
      for (const f of (d.fields || [])) {
        if (looksLikeCompanyField(f)) return true
      }
    }
    return false
  }, [selectedTemplate])

  // ── Recipients actions (RecipientsGroup gère ajout/suppression/réorga via drag&drop) ──

  // ── Validation ──
  const validate = (): string | null => {
    if (!title.trim()) return 'Titre obligatoire'
    if (documents.length === 0) return 'Ajoute au moins un document PDF'
    const validSigners = recipients.filter(r => r.role !== 'cc' && r.name.trim() && r.email.trim())
    if (validSigners.length === 0) return 'Ajoute au moins un signataire avec nom et email'
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const r of recipients) {
      if (r.email && !emailRe.test(r.email)) return `Email invalide : "${r.email}"`
    }
    // v2.2.4 — Société obligatoire si template a un field company
    if (hasCompanyField && !(advanced.companyName && advanced.companyName.trim())) {
      return 'Renseigne le « Nom de la société cliente » dans Options avancées (le template contient un champ Société auto-rempli)'
    }
    // v2.2.5 Phase 4d — phone obligatoire si canal whatsapp/both
    if (advanced.channel === 'whatsapp' || advanced.channel === 'both') {
      const missing = recipients
        .filter(r => r.name.trim() && r.email.trim())
        .filter(r => !r.phone || !/^\+\d{10,15}$/.test(r.phone))
        .map(r => r.name || r.email)
      if (missing.length > 0) {
        return `Numéro WhatsApp manquant ou invalide pour : ${missing.join(', ')}. Renseigne le téléphone (E.164) sur chaque destinataire ou choisis le canal Email seul.`
      }
    }
    return null
  }

  // ── Submit ──
  // v2.8.0 — Mode 'preview' : crée le brouillon puis redirige vers l'éditeur
  // visuel du template ad-hoc lié pour ajuster les positions des fields, avant
  // de revenir finaliser/envoyer l'enveloppe.
  const submit = async (mode: 'send' | 'draft' | 'preview') => {
    // En mode preview, on ne bloque pas sur l'absence de destinataires :
    // l'admin pourra les ajouter au retour avant d'envoyer.
    if (mode !== 'preview') {
      const err = validate()
      if (err) { toast.error(err); return }
    } else {
      if (!title.trim()) { toast.error('Titre requis avant de prévisualiser'); return }
      if (documents.length === 0) { toast.error('Upload un PDF avant de prévisualiser'); return }
    }
    setSubmitting(mode)
    try {
      // Lien candidat si 1er signer linké
      const firstLinked = recipients.find(r => r.role !== 'cc' && r.candidat_id)
      const candidatId = firstLinked?.candidat_id || candidatIdParam || null

      // Clean recipients pour le POST (retire candidat_id qui n'est pas dans le schéma jsonb)
      // Préserve firstName/lastName pour pré-remplir les fields auto-fill côté wizard
      const cleanRecipients = recipients
        .filter(r => r.name.trim() && r.email.trim())
        .map(({ candidat_id, ...r }, i) => ({ ...r, order: i }))

      // v2.8.0 — Template "contrat" : transfère les fields du template (signatures,
      // dates, etc.) sur les docs uploadés (override). Coords proportionnelles 0-1
      // → marchent tant que le PDF override est en A4 comme le template.
      let finalDocuments = documents
      if (isContractTemplate && selectedTemplate && documents.length > 0) {
        const tplDocs = selectedTemplate.documents || []
        finalDocuments = documents.map((d, idx) => {
          const tplDoc = tplDocs[idx] || tplDocs[0]  // mappe par index, fallback doc[0]
          if (!tplDoc) return d
          return {
            ...d,
            // Copie les fields + page_count + dimensions du template
            fields: tplDoc.fields ? [...tplDoc.fields] : d.fields,
            page_count: tplDoc.page_count ?? d.page_count,
            pdf_dimensions: tplDoc.pdf_dimensions ?? d.pdf_dimensions,
          }
        })
      }

      // v2.2.2 — Si on édite un brouillon existant : PATCH au lieu de POST
      // v2.8.0 — Pour les templates contrat, on envoie les documents (override)
      // même si template_id est présent.
      const payload = {
        title: title.trim(),
        template_id: templateId || null,
        candidate_id: candidatId,
        document_category: category,
        recipients: cleanRecipients,
        message: message.trim() || null,
        // V1 : on stocke aussi les docs uploadés direct (pas dans template) dans l'enveloppe
        // v2.8.0 : pour template contrat, on envoie aussi les documents override
        documents: (!templateId || isContractTemplate) ? finalDocuments : undefined,
        // Options avancées
        expires_in_days: advanced.expiresInDays,
        reminder_frequency_days: advanced.reminderFrequencyDays,
        expiry_warning_days: advanced.expiryWarningDays,
        // v2.2.5 Phase 4d — canal d'envoi (email/whatsapp/both)
        delivery_channel: advanced.channel,
        // Contexte (week_start_date pour rapports heures, companyName pour fields type=company, etc.)
        context_data: (() => {
          const ctx: Record<string, string> = {}
          if (advanced.weekStartDate) ctx.weekStartDate = advanced.weekStartDate
          if (advanced.companyName && advanced.companyName.trim()) ctx.companyName = advanced.companyName.trim()
          return Object.keys(ctx).length > 0 ? ctx : null
        })(),
      }
      const isEditingDraft = !!draftIdParam
      const r = await fetch(
        isEditingDraft
          ? `/api/sign/envelopes/${draftIdParam}`
          : '/api/sign/envelopes',
        {
          method: isEditingDraft ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur')
      const envelopeId = data.envelope.id

      if (mode === 'send') {
        // 2. Envoi direct
        const sendR = await fetch(`/api/sign/envelopes/${envelopeId}/send`, { method: 'POST' })
        const sendData = await sendR.json()
        if (!sendR.ok) throw new Error(sendData.error || 'Erreur envoi')
        // v2.8.5 — Toast spécifique si ta signature pré-enregistrée a été apposée
        if (sendData.autoSignedCreator) {
          toast.success('Enveloppe envoyée ✓ Ta signature a été apposée automatiquement.')
        } else {
          toast.success('Enveloppe envoyée')
        }
        router.push(`/sign/${envelopeId}`)
      } else if (mode === 'preview') {
        // v2.8.0 — Récupère le template_id (ad-hoc cloné côté serveur quand
        // template contrat + docs override) pour ouvrir son éditeur visuel.
        const envR = await fetch(`/api/sign/envelopes/${envelopeId}`)
        const envData = await envR.json()
        const adHocTplId = envData?.envelope?.template_id as string | undefined
        if (!adHocTplId) {
          toast.error('Impossible d\'ouvrir l\'éditeur — template ad-hoc introuvable')
          router.push(`/sign/${envelopeId}`)
        } else {
          toast.success('Brouillon créé — ajuste les positions de signature')
          router.push(`/sign/templates/${adHocTplId}/edit?envelopeDraft=${envelopeId}`)
        }
      } else {
        toast.success(isEditingDraft ? 'Brouillon mis à jour' : 'Brouillon enregistré')
        router.push(isEditingDraft ? `/sign/${envelopeId}` : '/sign')
      }
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    // Wrapper full-screen modal-like : se détache du layout dashboard
    // (sidebar + TopBar TalentFlow masquées) pour avoir le scroll intérieur au wrapper.
    // Le header sticky dedans utilise CE wrapper comme scroll container.
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'var(--bg-sunken, var(--background))',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Header sticky — top: 0 du wrapper scrollable, opaque, ombre légère */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        height: 64,
        boxSizing: 'border-box',
      }}>
        <button
          type="button"
          onClick={() => router.push('/sign')}
          className="neo-btn-ghost neo-btn-sm"
          title="Annuler et retourner aux signatures"
        >
          <X size={14} />
          {!isMobile && 'Annuler'}
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-instrument-serif, Georgia), serif',
            fontSize: isMobile ? 18 : 22,
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.3px',
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}>
            <FileSignature size={isMobile ? 16 : 20} style={{ color: 'var(--primary)' }} />
            {draftIdParam ? 'Modifier le brouillon' : 'Nouvel envoi'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => submit('draft')}
          disabled={submitting !== null}
          className="neo-btn-ghost neo-btn-sm"
          title="Enregistrer comme brouillon"
        >
          {submitting === 'draft' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {!isMobile && 'Brouillon'}
        </button>
        <button
          type="button"
          onClick={() => submit('send')}
          disabled={submitting !== null}
          className="neo-btn-yellow"
          style={{ minWidth: isMobile ? 44 : 110 }}
        >
          {submitting === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {!isMobile && 'Envoyer'}
        </button>
      </header>

      {/* Body — scroll naturel de la fenêtre, pas de flex */}
      <main style={{
        padding: isMobile ? '20px 16px 60px' : '28px 32px 80px',
        maxWidth: 880,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* SECTION 1 : Titre + Catégorie + Template */}
          <Section title="Informations" icon={FileText}>
            <Field label="Titre de l'envoi *">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex : Contrat CDI — Pedro Ferreira"
                className="neo-input"
                style={{ height: 42, fontSize: 14 }}
              />
            </Field>
            {/* v2.8.0 — Champ Catégorie retiré : déduit automatiquement du template
                choisi (template.template_category → enveloppe.document_category). */}
            <Field label="Template (optionnel)" hint="Pré-remplit les PDFs et destinataires">
              <select
                value={templateId}
                onChange={e => {
                  setTemplateId(e.target.value)
                  if (!e.target.value) setDocuments([])  // unlock + clear si on désélectionne
                }}
                className="neo-input"
                style={{ height: 42, cursor: 'pointer' }}
              >
                <option value="">— Sans template —</option>
                {/* v2.8.5 — Inclure l'ad-hoc courant dans le dropdown pour qu'il
                    s'affiche correctement quand on revient de l'éditeur (sinon
                    "— Sans template —" trompeur). On strip "[Envoi] " et on
                    n'affiche que l'ad-hoc lié au brouillon courant, pas les autres. */}
                {templates
                  .filter(t => {
                    const adHocParent = (t as { parent_template_id?: string | null }).parent_template_id
                    if (!adHocParent) return true  // vrai template
                    return t.id === templateId  // ad-hoc affiché uniquement si c'est celui du brouillon courant
                  })
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name.replace(/^\[Envoi\]\s+/, '')}
                    </option>
                  ))}
              </select>
            </Field>
          </Section>

          {/* SECTION 2 : Documents */}
          <Section title="Documents" icon={FileText} subtitle={
            isTemplateLocked
              ? 'Documents du template (lecture seule)'
              : isContractTemplate
                ? 'Upload le contrat du jour — les positions de signature du template seront appliquées automatiquement'
                : 'Glissez vos PDFs ou cliquez pour parcourir'
          }>
            {/* v2.8.0 — Bandeau explicatif pour template contrat */}
            {isContractTemplate && documents.length === 0 && (
              <div style={{
                marginBottom: 12,
                padding: '12px 14px',
                background: 'var(--primary-soft)',
                border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 10,
                fontSize: 12.5,
                color: 'var(--foreground)',
                lineHeight: 1.5,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>📄</span>
                <div style={{ flex: 1 }}>
                  <strong>Template « Contrat de travail »</strong> — Upload le contrat du jour (PDF brut ou
                  déjà imprimé+signé). Les <strong>positions de signature</strong> définies dans le template
                  seront appliquées automatiquement (format A4 requis).<br/>
                  ✓ Coche <strong>« Ajouter le papier à en-tête L-Agence »</strong> si ton PDF est brut.<br/>
                  ✗ Décoche si ton PDF a déjà le logo (contrat scanné).
                </div>
              </div>
            )}
            <DocumentUploader
              documents={documents}
              onChange={setDocuments}
              readOnly={isTemplateLocked}
              contractMode={isContractTemplate}
            />
            {/* v2.8.0 — Bouton "Voir et ajuster les positions" pour template contrat
                quand au moins 1 PDF uploadé. Crée le brouillon + ouvre l'éditeur visuel
                sur le template ad-hoc (cloné serveur-side avec les fields hérités). */}
            {isContractTemplate && documents.length > 0 && (
              <button
                type="button"
                onClick={() => submit('preview')}
                disabled={submitting !== null}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1.5px dashed var(--primary, #EAB308)',
                  borderRadius: 10,
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: submitting !== null ? 'wait' : 'pointer',
                  opacity: submitting !== null ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.15s',
                }}
                title="Sauvegarde un brouillon et ouvre l'éditeur visuel sur ce PDF pour vérifier/déplacer les zones de signature avant l'envoi"
              >
                {submitting === 'preview' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Move size={15} style={{ color: 'var(--primary, #A16207)' }} />
                )}
                📐 Voir et ajuster les positions de signature sur ce PDF
              </button>
            )}
            {isTemplateLocked && (
              <div style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--info-soft)',
                borderRadius: 8,
                fontSize: 11.5,
                color: 'var(--info)',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <Sparkles size={12} />
                <span style={{ flex: 1 }}>
                  Pour modifier les PDFs ou les champs, ouvre l&apos;éditeur du template.
                </span>
                <button
                  type="button"
                  onClick={() => router.push(`/sign/templates/${selectedTemplate?.id}/edit`)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 11.5,
                    background: 'transparent',
                    border: '1px solid currentColor',
                    borderRadius: 6,
                    color: 'inherit',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Edit3 size={11} />
                  Modifier les champs
                </button>
              </div>
            )}
          </Section>

          {/* SECTION 3 : Destinataires */}
          <Section title="Destinataires" icon={Users}>
            {/* v2.2.1 — Mode "Rôles fixés du template" : si template avec schema sélectionné */}
            {useTemplateRoles && selectedTemplate && (selectedTemplate.recipients_schema || []).length > 0 ? (
              <RoleFixedRecipients
                recipients={recipients}
                onChange={setRecipients}
                templateName={selectedTemplate.name}
                templateRoleCount={templateRoleCount}
                onSwitchToFreeMode={() => setUseTemplateRoles(false)}
                requirePhone={advanced.channel === 'whatsapp' || advanced.channel === 'both'}
                me={me}
              />
            ) : (
              <>
                {/* Toggle ordre seq/parallèle pour le mode libre */}
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  background: orderEnabled ? 'var(--primary-soft)' : 'var(--surface-2)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  marginBottom: 14,
                }}>
                  <input
                    type="checkbox"
                    checked={orderEnabled}
                    onChange={e => setOrderEnabled(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                  />
                  <ListOrdered size={13} style={{ color: orderEnabled ? 'var(--primary)' : 'var(--muted)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                    Définir des étapes de signature
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {orderEnabled ? '(routing avec étapes parallèles)' : '(envoi simultané à tous)'}
                  </span>
                </label>

                {/* Bouton retour au mode rôles si template sélectionné */}
                {selectedTemplate && (selectedTemplate.recipients_schema || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseTemplateRoles(true)}
                    className="neo-btn-ghost neo-btn-sm"
                    style={{ marginBottom: 12 }}
                  >
                    ← Revenir aux rôles du template
                  </button>
                )}

                <RecipientsGroup
                  recipients={recipients}
                  onChange={setRecipients}
                  orderEnabled={orderEnabled}
                  requirePhone={advanced.channel === 'whatsapp' || advanced.channel === 'both'}
                />
              </>
            )}
          </Section>

          {/* SECTION 4 : Message (v2.8.6 — Objet supprimé car jamais utilisé,
              le subject email est auto-généré depuis le Titre de l'envoi) */}
          <Section title="Message personnalisé (optionnel)" icon={MessageSquare} subtitle="Ajoute un mot personnel dans l'email envoyé aux destinataires">
            <Field label="Message" hint="Affiché entre l'intro et le bouton de signature">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Bonjour, voici les documents à signer pour votre dossier d'inscription…"
                rows={4}
                className="neo-input"
                style={{ minHeight: 100, padding: '10px 13px', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
          </Section>

          {/* SECTION 5 : Options avancées */}
          <AdvancedOptions value={advanced} onChange={setAdvanced} companyRequired={hasCompanyField} />

          <div style={{ height: 40 }} />
        </div>
      </main>
    </div>
  )
}

// ─── UI helpers ──────────────────────────────────────────────────────
function Section({
  title, icon: Icon, subtitle, children,
}: {
  title: string; icon: typeof FileText; subtitle?: string; children: React.ReactNode
}) {
  return (
    <section style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 22,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--muted)',
        }}>
          <Icon size={11} style={{ color: 'var(--primary)' }} />
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </section>
  )
}

function Field({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 11.5, fontWeight: 600,
        color: 'var(--text-2, var(--foreground))',
        marginBottom: 6,
      }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--muted)' }}>· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ─── RoleFixedRecipients — mode DocuSign "rôles du template" ──────────
// v2.2.1
// Affiche 1 carte par rôle du template (read-only role + saisie nom/email)
// Pas d'ajout/suppression — la structure est fixée par le template.
function RoleFixedRecipients({
  recipients, onChange, templateName, templateRoleCount, onSwitchToFreeMode, requirePhone, me,
}: {
  recipients: any[]
  onChange: (r: any[]) => void
  templateName: string
  /** v2.2.2 — Nombre de rôles définis par le template. Les destinataires
   *  au-delà de cet index sont des CC libres (ajoutés par l'admin). */
  templateRoleCount: number
  onSwitchToFreeMode: () => void
  /** v2.2.5 Phase 4d — propagé à PhoneInput pour exiger un phone E.164 */
  requirePhone?: boolean
  /** v2.8.6 — Profil du user connecté pour le bouton « Moi » auto-fill */
  me?: { firstName: string; lastName: string; email: string; phone?: string } | null
}) {
  const updateRecipient = (idx: number, patch: any) =>
    onChange(recipients.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  // v2.2.2 — Ajout d'un destinataire en copie (CC) en plus des rôles fixés
  const addCcRecipient = () => {
    const maxOrder = Math.max(0, ...recipients.map(r => r.order || 0))
    onChange([...recipients, {
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      role: 'cc',
      roleName: 'Copie',
      order: maxOrder + 1,
      status: 'pending',
      signed_at: null,
      preferredViewMode: 'auto',
    }])
  }
  const removeRecipient = (idx: number) => {
    onChange(recipients.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div style={{
        padding: '10px 12px',
        background: 'var(--info-soft)',
        borderRadius: 8,
        fontSize: 12.5,
        color: 'var(--info)',
        lineHeight: 1.5,
        marginBottom: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>📋</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          Le template <strong>{templateName}</strong> définit {recipients.length} rôle{recipients.length > 1 ? 's' : ''}.
          Remplis juste le <strong>nom et email</strong> de chaque destinataire — leurs champs respectifs leur seront automatiquement assignés.
        </div>
        <button
          type="button"
          onClick={onSwitchToFreeMode}
          style={{
            padding: '4px 10px',
            fontSize: 11.5,
            background: 'transparent',
            border: '1px solid currentColor',
            borderRadius: 6,
            color: 'inherit',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title="Permet de modifier les rôles, ordres et destinataires"
        >
          <Edit3 size={11} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }} />
          Personnaliser
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recipients.map((r, idx) => {
          // v2.8.0 — Avant : `Math.max(1, r.order || 1) - 1` mappait order=0 ET
          // order=1 au même index 0 → 2 rôles distincts affichés en bleu. Fix :
          // utiliser order direct (mod palette pour éviter index hors borne).
          const palette = RECIPIENT_COLORS[Math.max(0, r.order ?? 0) % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0]
          const safeOrder = r.order ?? idx
          const isCC = r.role === 'cc'
          // v2.2.2 — Destinataire ajouté en plus des rôles du template (= supprimable)
          const isExtra = idx >= templateRoleCount
          return (
            <div
              key={idx}
              style={{
                padding: '14px 16px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${palette.stroke}`,
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Header : badge ordre + roleName + role figé */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 999,
                  background: palette.stroke, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  flexShrink: 0,
                }}>
                  {safeOrder}
                </div>
                {/* v2.8.0 — RoleName éditable (synchronise au template ad-hoc via PATCH) */}
                <input
                  type="text"
                  value={r.roleName || ''}
                  placeholder={`Rôle ${safeOrder} (ex: Candidat, Consultant…)`}
                  onChange={e => updateRecipient(idx, { roleName: e.target.value })}
                  style={{
                    flex: '0 1 220px',
                    fontSize: 14, fontWeight: 700,
                    color: 'var(--foreground)',
                    background: 'transparent',
                    border: '1px dashed transparent',
                    borderRadius: 6,
                    padding: '3px 6px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = palette.stroke; e.currentTarget.style.background = palette.fill }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                  title="Renommer ce rôle — synchronisé avec l'éditeur de template"
                />
                {/* v2.8.6 — Bouton « Moi » : auto-fill avec le profil du user connecté */}
                {me && me.email && (
                  <button
                    type="button"
                    onClick={() => {
                      const fullName = `${me.firstName} ${me.lastName}`.trim() || me.email.split('@')[0]
                      updateRecipient(idx, {
                        name: fullName,
                        firstName: me.firstName,
                        lastName: me.lastName,
                        email: me.email,
                        ...(me.phone ? { phone: me.phone } : {}),
                      })
                    }}
                    title={`Auto-remplir avec votre profil (${me.email})`}
                    style={{
                      padding: '3px 9px',
                      fontSize: 11, fontWeight: 700,
                      border: `1px solid ${palette.stroke}`,
                      background: palette.fill,
                      color: palette.stroke,
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}
                  >
                    👤 Moi
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  // v2.2.2 — Couleur stroke vif (palette.stroke) pour lisibilité
                  // light + dark, au lieu de palette.text qui est trop foncé
                  // sur fond rgba transparent en dark mode.
                  background: isCC ? 'var(--surface-2)' : palette.fill,
                  color: isCC ? 'var(--muted)' : palette.stroke,
                  border: '1px solid',
                  borderColor: isCC ? 'var(--border)' : palette.stroke,
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {isCC ? '👁 Copie' : '✍️ Signe'}
                </span>
                {isExtra && (
                  <button
                    type="button"
                    onClick={() => removeRecipient(idx)}
                    title="Retirer ce destinataire"
                    style={{
                      width: 28, height: 28,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: '#DC2626', cursor: 'pointer',
                      borderRadius: 8,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* v2.2.3 — Inputs : Prénom (autocomplete candidats DB) + Nom + Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 8 }}>
                <FirstNameAutocomplete
                  value={r.firstName ?? ''}
                  isLinked={!!r.candidat_id}
                  onChange={(firstName, candidat) => {
                    if (candidat) {
                      const fn = candidat.prenom || firstName
                      const ln = candidat.nom || ''
                      const candPhone = candidat.telephone ? normalizePhoneE164(candidat.telephone) : null
                      updateRecipient(idx, {
                        firstName: fn,
                        lastName: ln,
                        name: [fn, ln].filter(Boolean).join(' ').trim() || fn,
                        email: candidat.email || r.email,
                        phone: candPhone || r.phone,
                        candidat_id: candidat.id,
                      })
                    } else {
                      const ln = r.lastName ?? ''
                      updateRecipient(idx, {
                        firstName,
                        name: [firstName, ln].filter(Boolean).join(' ').trim(),
                        candidat_id: null,
                      })
                    }
                  }}
                  onUnlink={() => updateRecipient(idx, { candidat_id: null })}
                />
                <input
                  type="text"
                  value={r.lastName ?? ''}
                  placeholder="Nom"
                  onChange={e => {
                    const ln = e.target.value
                    const fn = r.firstName ?? ''
                    updateRecipient(idx, {
                      lastName: ln,
                      name: [fn, ln].filter(Boolean).join(' ').trim(),
                    })
                  }}
                  className="neo-input"
                  style={{ height: 38, fontSize: 13 }}
                />
                <input
                  type="email"
                  value={r.email ?? ''}
                  placeholder="email@example.com"
                  onChange={e => updateRecipient(idx, { email: e.target.value })}
                  className="neo-input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              {/* v2.2.5 Phase 4d — Phone WhatsApp (E.164) */}
              <PhoneInput
                value={r.phone || ''}
                required={!!requirePhone}
                color={palette.stroke}
                onChange={phone => updateRecipient(idx, { phone })}
              />

              {/* v2.2.3 — Bandeau "Ajouter comme contact de [Client]" si email match */}
              <ClientContactSuggestion
                email={r.email}
                firstName={r.firstName}
                lastName={r.lastName}
                roleName={r.roleName}
              />

              {/* v2.2.2 — Mode d'affichage par destinataire (signers uniquement) */}
              {!isCC && (
                <ViewModePicker
                  value={r.preferredViewMode || 'auto'}
                  onChange={(mode) => updateRecipient(idx, { preferredViewMode: mode })}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* v2.2.2 — Bouton ajouter une copie (CC) en plus des rôles du template */}
      <button
        type="button"
        onClick={addCcRecipient}
        className="neo-btn-ghost"
        style={{
          marginTop: 12,
          width: '100%',
          justifyContent: 'center',
          borderStyle: 'dashed',
          padding: '10px 14px',
        }}
        title="Ajouter une personne qui recevra une copie du document signé par email"
      >
        <Plus size={14} />
        Ajouter en copie (CC)
      </button>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
        💡 Les destinataires en copie reçoivent le PDF final signé par email — ils ne signent pas le document.
      </p>
    </div>
  )
}

// ─── ViewModePicker — toggle 3 modes (auto / wizard / document) ─────────
// v2.2.2
function ViewModePicker({
  value, onChange,
}: {
  value: 'wizard' | 'document' | 'auto'
  onChange: (m: 'wizard' | 'document' | 'auto') => void
}) {
  const options: { v: 'auto' | 'wizard' | 'document'; label: string; icon: string; desc: string }[] = [
    { v: 'auto',     label: 'Auto',     icon: '✨', desc: 'Wizard sur mobile, document sur desktop' },
    { v: 'wizard',   label: 'Wizard',   icon: '📋', desc: 'Formulaire pas-à-pas (idéal saisie longue)' },
    { v: 'document', label: 'Document', icon: '📄', desc: 'Vue PDF complète (idéal validation/signature)' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--muted)',
      }}>
        Mode d&apos;affichage à la signature
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const active = value === opt.v
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              title={opt.desc}
              style={{
                flex: '1 1 110px',
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                border: '1.5px solid',
                borderColor: active ? '#EAB308' : 'var(--border)',
                background: active ? 'var(--primary-soft)' : 'var(--card)',
                color: 'var(--foreground)',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <span>{opt.icon}</span>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── ClientContactSuggestion — bandeau "Ajouter ce destinataire comme contact de [Client]" ──
// v2.2.3 — Quand l'admin tape un email dont le domaine correspond à une entreprise
// déjà dans la base clients, on propose de lier ce destinataire comme contact
// de cette entreprise (pour le retrouver facilement plus tard).
function ClientContactSuggestion({
  email, firstName, lastName, roleName,
}: {
  email: string | undefined
  firstName: string | undefined
  lastName: string | undefined
  roleName: string | undefined
}) {
  const [suggestion, setSuggestion] = useState<{
    clientId: string
    clientName: string
    isAlreadyContact: boolean
  } | null>(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSuggestion(null)
    setAdded(false)
    setDismissed(false)
    if (!email || !email.includes('@')) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/clients/match-email?email=${encodeURIComponent(email)}`)
        const d = await r.json()
        if (d.client) {
          setSuggestion({
            clientId: d.client.id,
            clientName: d.client.nom_entreprise,
            isAlreadyContact: !!d.isAlreadyContact,
          })
        }
      } catch { /* silencieux */ }
    }, 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [email])

  if (!suggestion || dismissed) return null
  if (suggestion.isAlreadyContact) {
    return (
      <div style={{
        marginTop: 4,
        padding: '6px 10px',
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.35)',
        borderRadius: 8,
        fontSize: 11.5,
        color: '#15803D',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        ✓ Déjà contact de <strong>{suggestion.clientName}</strong>
      </div>
    )
  }

  const onAdd = async () => {
    if (!email) return
    setAdding(true)
    try {
      const r = await fetch(`/api/clients/${suggestion.clientId}/add-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          firstName: firstName || '',
          lastName: lastName || '',
          role: roleName || '',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success(`Ajouté comme contact de ${suggestion.clientName}`)
      setAdded(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAdding(false)
    }
  }

  if (added) {
    return (
      <div style={{
        marginTop: 4,
        padding: '6px 10px',
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.35)',
        borderRadius: 8,
        fontSize: 11.5,
        color: '#15803D',
      }}>
        ✓ Contact ajouté à <strong>{suggestion.clientName}</strong>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 4,
      padding: '8px 10px',
      background: 'rgba(234,179,8,0.10)',
      border: '1px solid rgba(234,179,8,0.45)',
      borderRadius: 8,
      fontSize: 12,
      color: 'var(--foreground)',
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 14 }}>💡</span>
      <span style={{ flex: 1, minWidth: 180 }}>
        Cet email semble appartenir à <strong>{suggestion.clientName}</strong>.
        L&apos;ajouter comme contact ?
      </span>
      <button
        type="button"
        onClick={onAdd}
        disabled={adding}
        style={{
          padding: '4px 10px',
          fontSize: 11.5, fontWeight: 700,
          background: '#EAB308',
          color: '#1C1A14',
          border: 'none',
          borderRadius: 6,
          cursor: adding ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          opacity: adding ? 0.6 : 1,
        }}
      >
        {adding ? 'Ajout…' : 'Ajouter'}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        title="Ignorer"
        style={{
          width: 22, height: 22,
          border: 'none', background: 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer', fontSize: 16, lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
