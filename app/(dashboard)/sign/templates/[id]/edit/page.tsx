// TalentFlow Sign — Éditeur visuel de template (page)
// v2.2.0 — Phase 2
'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Sparkles, FileText, ListChecks } from 'lucide-react'
import TemplateEditor from '@/components/sign/TemplateEditor'
import WizardEditor from '@/components/sign/WizardEditor'
import type { SignTemplate, SignDocument, SignRecipientSchema } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

interface PageProps {
  params: Promise<{ id: string }>
}

type TabId = 'document' | 'wizard'

export default function TemplateEditPage({ params }: PageProps) {
  const { id } = use(params)
  const [template, setTemplate] = useState<SignTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('wizard')

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

  // Détecte si import DocuSign (au moins un champ source: docusign)
  const isDocusignImport = !!template?.documents.some(d =>
    (d.fields || []).some(f => f.source === 'docusign')
  )

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/sign/templates"
          className="neo-btn-ghost neo-btn-sm"
          style={{ padding: '4px 10px' }}
        >
          <ChevronLeft size={14} />
          Templates
        </Link>
      </div>

      {/* Header */}
      <div className="d-page-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span>{loading ? 'Chargement...' : (template?.name || 'Template')}</span>
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
            onClick={() => setActiveTab('wizard')}
            style={tabStyle(activeTab === 'wizard')}
          >
            <ListChecks size={14} />
            Mode Wizard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('document')}
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
