// TalentFlow Sign — Éditeur visuel de template (page)
// v2.2.0 — Phase 2
// v2.8.0 — Support ?envelopeDraft={id} (édition pour un envoi en cours)
'use client'

import { use, useCallback, useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeft, Loader2, Sparkles, FileText, ListChecks, ArrowLeftCircle, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import TemplateEditor from '@/components/sign/TemplateEditor'
import WizardEditor from '@/components/sign/WizardEditor'
import type { SignTemplate, SignDocument, SignRecipientSchema } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

interface PageProps {
  params: Promise<{ id: string }>
}

type TabId = 'document' | 'wizard'

// v2.8.0 — Wrapper Suspense pour useSearchParams (Next.js 15 prerendering)
export default function TemplateEditPageWrapper(props: PageProps) {
  return (
    <Suspense fallback={null}>
      <TemplateEditPage {...props} />
    </Suspense>
  )
}

function TemplateEditPage({ params }: PageProps) {
  const { id } = use(params)
  // v2.8.0 — Si présent, on édite ce template POUR un envoi en cours
  // (template ad-hoc cloné depuis le parent au moment du brouillon).
  const searchParams = useSearchParams()
  const envelopeDraft = searchParams.get('envelopeDraft') || ''
  // v2.9.70 — Détecte si on est sur la route /sign/rapports/* pour pointer
  // le bouton retour vers la bonne liste (rapports vs signatures).
  const pathname = usePathname() || ''
  const isReportRoute = pathname.startsWith('/sign/rapports/')
  const [template, setTemplate] = useState<SignTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('wizard')

  // v2.8.6 — Édition inline du nom du template
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const handleSaveName = async () => {
    const newName = nameDraft.trim()
    if (!newName || !template || newName === template.name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const r = await fetch(`/api/sign/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      if (!r.ok) throw new Error('Erreur')
      setTemplate(t => t ? { ...t, name: newName } : t)
      setEditingName(false)
      toast.success('Nom du template mis à jour ✓')
    } catch {
      toast.error('Erreur sauvegarde nom')
    } finally {
      setSavingName(false)
    }
  }

  // v2.2.2 — État partagé entre Mode Wizard et Mode Document.
  // Avant : chaque éditeur avait sa copie locale de documents/schema → switcher
  // d'onglet sans sauver = perdre les modifs. Maintenant : source unique au parent.
  const [documents, setDocuments] = useState<SignDocument[]>([])
  const [recipientsSchema, setRecipientsSchema] = useState<SignRecipientSchema[]>([])
  const [wizardSteps, setWizardSteps] = useState<WizardStep[]>([])
  const [wizardEnabled, setWizardEnabled] = useState<boolean>(true)
  // v2.2.2 — Compteur incrémenté à chaque fetch (= chaque save successful).
  // Permet aux éditeurs enfants de reset leur dirty=false quand le parent recharge.
  const [serverVersion, setServerVersion] = useState(0)

  const fetchTemplate = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/sign/templates/${id}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        const tpl = d.template as SignTemplate & { wizard_enabled?: boolean; wizard_steps?: WizardStep[] }
        setTemplate(tpl)
        // Sync l'état partagé depuis le template fraîchement fetché
        setDocuments(tpl.documents || [])
        setRecipientsSchema(tpl.recipients_schema || [])
        setWizardSteps(tpl.wizard_steps || [])
        setWizardEnabled(tpl.wizard_enabled !== false)
        setServerVersion(v => v + 1)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetchTemplate()
  }, [fetchTemplate])

  // v2.7.4 — Save synchrone (sans refetch) déclenché aux moments charnières :
  // switch d'onglet (Wizard ↔ Document) et sortie de la page (beforeunload /
  // visibilitychange hidden / pagehide). Garantit qu'aucune modif ne se perd
  // même si l'auto-save 800ms de TemplateEditor n'a pas encore eu le temps de
  // partir. Utilise `keepalive: true` pour que la requête survive à la
  // fermeture de l'onglet (limite 64 KB — suffisant pour un JSON de template).
  const stateRef = useRef({ documents, recipientsSchema, wizardSteps, wizardEnabled })
  stateRef.current = { documents, recipientsSchema, wizardSteps, wizardEnabled }

  const flushSave = useCallback((opts?: { keepalive?: boolean }) => {
    const body = JSON.stringify({
      documents: stateRef.current.documents,
      recipients_schema: stateRef.current.recipientsSchema,
      wizard_steps: stateRef.current.wizardSteps,
      wizard_enabled: stateRef.current.wizardEnabled,
    })
    // v2.9.10 — Best-effort flush. fetch() retourne une Promise → un try/catch sync
    // ne capte rien. Ajout d'un .catch() pour silencer les "TypeError: Failed to fetch"
    // qui pollualent Sentry quand le navigateur abort la requête (close onglet, navigation).
    fetch(`/api/sign/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: opts?.keepalive === true,
    }).catch(() => { /* best-effort, pas de récupération possible */ })
  }, [id])

  // Switch d'onglet → flush avant le changement
  const handleTabSwitch = useCallback((next: TabId) => {
    if (next !== activeTab) flushSave()
    setActiveTab(next)
  }, [activeTab, flushSave])

  // Sortie de page → flush avec keepalive (best-effort, survit au close)
  useEffect(() => {
    const onUnload = () => flushSave({ keepalive: true })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushSave({ keepalive: true })
    }
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flushSave])

  // Détecte si import DocuSign (au moins un champ source: docusign)
  const isDocusignImport = !!template?.documents.some(d =>
    (d.fields || []).some(f => f.source === 'docusign')
  )

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {envelopeDraft ? (
          // v2.8.0 — Édition pour un envoi en cours : retour direct au brouillon /sign/new
          <>
            <Link
              href={`/sign/new?draft=${envelopeDraft}`}
              className="neo-btn-yellow neo-btn-sm"
              style={{ padding: '4px 12px', fontWeight: 700 }}
            >
              <ArrowLeftCircle size={14} />
              Retour à l&apos;envoi en cours
            </Link>
            <span style={{
              padding: '4px 10px',
              fontSize: 11.5,
              fontWeight: 700,
              background: 'var(--primary-soft)',
              color: 'var(--primary, #A16207)',
              borderRadius: 999,
              border: '1px solid rgba(234,179,8,0.35)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              📐 Édition pour un envoi
            </span>
          </>
        ) : (
          <Link
            href={isReportRoute ? '/sign/rapports/templates' : '/sign/templates'}
            className="neo-btn-ghost neo-btn-sm"
            style={{ padding: '4px 10px' }}
          >
            <ChevronLeft size={14} />
            {isReportRoute ? 'Templates Rapports' : 'Templates'}
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="d-page-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {/* v2.8.6 — Nom du template éditable inline. Click → input, blur/Enter sauve. */}
            {loading ? (
              <span>Chargement...</span>
            ) : editingName ? (
              <input
                type="text"
                value={nameDraft}
                autoFocus
                disabled={savingName}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSaveName() }
                  if (e.key === 'Escape') { e.preventDefault(); setEditingName(false) }
                }}
                style={{
                  font: 'inherit', color: 'inherit', background: 'transparent',
                  border: '1px dashed var(--primary)', borderRadius: 6,
                  padding: '2px 8px', minWidth: 320, outline: 'none',
                }}
              />
            ) : (
              <span
                onClick={() => { setNameDraft(template?.name || ''); setEditingName(true) }}
                title="Cliquer pour renommer le template"
                style={{
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                  borderRadius: 6, padding: '2px 6px', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {template?.name || 'Template'}
                <Pencil size={14} style={{ color: 'var(--muted)', opacity: 0.6 }} />
              </span>
            )}
            {isDocusignImport && (
              <span className="neo-tag" style={{ fontSize: 11, gap: 4, display: 'inline-flex', alignItems: 'center' }}>
                <Sparkles size={11} />
                Importé DocuSign
              </span>
            )}
          </h1>
          <p className="d-page-sub">
            {activeTab === 'wizard'
              ? 'Mode Wizard · éditez les étapes du formulaire candidat'
              : 'Mode Document · placez et redimensionnez les champs sur chaque page'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      {!loading && !error && template && (
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 14,
          borderBottom: '1px solid var(--border)',
        }}>
          <button
            type="button"
            onClick={() => handleTabSwitch('wizard')}
            style={tabStyle(activeTab === 'wizard')}
          >
            <ListChecks size={14} />
            Mode Wizard
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('document')}
            style={tabStyle(activeTab === 'document')}
          >
            <FileText size={14} />
            Mode Document
          </button>
        </div>
      )}

      {loading ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement du template...</div>
        </div>
      ) : error ? (
        <div className="neo-empty">
          <div className="neo-empty-title">Erreur de chargement</div>
          <div className="neo-empty-sub">{error}</div>
        </div>
      ) : template ? (
        // v2.2.2 — Les 2 éditeurs restent montés en permanence (display:none pour
        // l'inactif). Combiné avec le state partagé au parent, cela préserve
        // intégralement les modifs en cours quand on switche d'onglet.
        <>
          <div style={{ display: activeTab === 'wizard' ? 'block' : 'none' }}>
            <WizardEditor
              templateId={template.id}
              documents={documents}
              setDocuments={setDocuments}
              wizardSteps={wizardSteps}
              setWizardSteps={setWizardSteps}
              wizardEnabled={wizardEnabled}
              setWizardEnabled={setWizardEnabled}
              recipientsSchema={recipientsSchema}
              setRecipientsSchema={setRecipientsSchema}
              serverVersion={serverVersion}
              onSaved={fetchTemplate}
            />
          </div>
          <div style={{ display: activeTab === 'document' ? 'block' : 'none' }}>
            <TemplateEditor
              templateId={template.id}
              templateName={template.name}
              documents={documents}
              setDocuments={setDocuments}
              recipientsSchema={recipientsSchema}
              setRecipientsSchema={setRecipientsSchema}
              wizardSteps={wizardSteps}
              setWizardSteps={setWizardSteps}
              wizardEnabled={wizardEnabled}
              serverVersion={serverVersion}
              onSaved={fetchTemplate}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: 'transparent',
  border: 'none',
  borderBottom: `2px solid ${active ? '#EAB308' : 'transparent'}`,
  color: active ? 'var(--foreground)' : 'var(--muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: -1,
})
