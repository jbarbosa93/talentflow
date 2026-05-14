// TalentFlow Sign — Assistant IA template (v2.8.0)
//
// Barre de chat fixée en bas de la page templates/[id]/edit. Réduit (48px) =
// juste un input cliquable. Expand (auto) = historique + suggestions + form.
// Réponses traitées via modal portalisé qui montre les changements avant apply.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Sparkles, Send, Loader2, X as XIcon, ChevronUp, ChevronDown, AlertTriangle, Check, MessageSquarePlus } from 'lucide-react'

// ─── Types (alignés avec la route /assistant) ───────────────────────
export type TemplateChange =
  | { op: 'set_required'; fieldId: string; value: boolean }
  | { op: 'set_label'; fieldId: string; label: string }
  | { op: 'add_condition'; fieldId: string; condition: { triggerFieldId: string; operator: string; value?: string; action: string } }
  | { op: 'remove_condition'; fieldId: string; conditionIndex: number }
  | { op: 'set_help_text'; fieldId: string; helpText: string }
  | { op: 'set_section'; fieldId: string; section: string | null }
  | { op: 'set_section_description'; section: string; description: string }
  | { op: 'move_to_step'; fieldId: string; stepId: string }
  | { op: 'create_step'; title: string; fieldIds: string[]; recipientOrder?: number }
  | { op: 'set_default_checked'; fieldId: string; value: boolean }
  | { op: 'group_fields'; fieldIds: string[]; rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly'; count: number; groupName?: string }

interface AssistantActionResponse {
  type: 'action'
  explanation: string
  changes: TemplateChange[]
  unsupported?: string
}
interface AssistantExplanationResponse { type: 'explanation'; text: string }
interface AssistantUnsupportedResponse { type: 'unsupported'; text: string; suggestion?: string }
type AssistantResponse = AssistantActionResponse | AssistantExplanationResponse | AssistantUnsupportedResponse

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  response?: AssistantResponse
  timestamp: number
}

interface Props {
  templateId: string
  selectedFieldId?: string | null
  currentMode: 'document' | 'wizard'
  /** Appelé quand user clique "Appliquer" : applique les changes au state. */
  onApplyChanges: (changes: TemplateChange[]) => void
}

export default function TemplateAssistantBar({
  templateId, selectedFieldId, currentMode, onApplyChanges,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [pendingChanges, setPendingChanges] = useState<{
    explanation: string
    changes: TemplateChange[]
    unsupported?: string
  } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll vers le bas quand un nouveau message arrive
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history])

  // Auto-focus à l'expand
  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [expanded])

  const suggestions = selectedFieldId
    ? [
        'Rends ce champ obligatoire',
        'Ajoute une explication pour ce champ',
        'Cache ce champ si la nationalité est Suisse',
      ]
    : [
        'Comment fonctionnent les conditions ?',
        'Quels champs ne sont dans aucune étape ?',
        'Crée une étape "Conjoint" avec les champs marié',
      ]

  const send = async (text?: string) => {
    const msg = (text ?? message).trim()
    if (!msg || loading) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: msg,
      timestamp: Date.now(),
    }
    setHistory(h => [...h.slice(-5), userMsg])
    setMessage('')
    setLoading(true)
    try {
      const r = await fetch(`/api/sign/templates/${templateId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          selectedFieldId: selectedFieldId || undefined,
          currentMode,
        }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')

      const parsed = d as AssistantResponse
      const summaryText =
        parsed.type === 'action'
          ? parsed.explanation + (parsed.unsupported ? `\n\n⚠️ ${parsed.unsupported}` : '')
          : parsed.type === 'explanation'
            ? parsed.text
            : `${parsed.text}${parsed.suggestion ? `\n\n💡 ${parsed.suggestion}` : ''}`

      const asstMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: summaryText,
        response: parsed,
        timestamp: Date.now(),
      }
      setHistory(h => [...h.slice(-5), asstMsg])

      // Si action avec changes → ouvrir la modal de confirmation
      if (parsed.type === 'action' && parsed.changes.length > 0) {
        setPendingChanges({
          explanation: parsed.explanation,
          changes: parsed.changes,
          unsupported: parsed.unsupported,
        })
      }
    } catch (e: any) {
      toast.error(e.message || 'Erreur assistant')
    } finally {
      setLoading(false)
    }
  }

  const applyPending = () => {
    if (!pendingChanges) return
    onApplyChanges(pendingChanges.changes)
    toast.success(`✓ ${pendingChanges.changes.length} modification${pendingChanges.changes.length > 1 ? 's appliquées' : ' appliquée'}`)
    setPendingChanges(null)
  }

  const reportFeatureRequest = async (parsedResponse: AssistantResponse, userMessage: string) => {
    const featureText = parsedResponse.type === 'unsupported'
      ? parsedResponse.text
      : parsedResponse.type === 'action' && parsedResponse.unsupported
        ? parsedResponse.unsupported
        : ''
    if (!featureText) return
    try {
      const r = await fetch('/api/feedback/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: featureText,
          context: 'template-editor-assistant',
          userMessage,
        }),
      })
      if (!r.ok) throw new Error()
      toast.success('💡 Demande enregistrée. João la consultera.')
    } catch {
      toast.error('Impossible d\'enregistrer la demande')
    }
  }

  // v2.8.0 — Portalisé via document.body pour échapper au motion.div parent
  // de DashboardShell qui applique filter/transform pendant les animations et
  // CASSE position: fixed (cf. CLAUDE.md pattern #10).
  if (typeof window === 'undefined') return null

  // ─── Rendu RÉDUIT (48px) ────────────────────────────────────────
  if (!expanded) {
    return createPortal(
      <div style={collapsedStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={collapsedButtonStyle}
          title="Ouvrir l'assistant IA"
        >
          <Sparkles size={16} style={{ color: '#EAB308', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left', color: 'var(--muted)' }}>
            Demande à l'assistant IA… (ex : « Rends Email obligatoire »)
          </span>
          <ChevronUp size={14} style={{ color: 'var(--muted)' }} />
        </button>
      </div>,
      document.body,
    )
  }

  // ─── Rendu EXPAND (auto height, max 320px) ──────────────────────
  return (
    <>
      {createPortal(
      <div style={expandedStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <Sparkles size={14} style={{ color: '#EAB308' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
            Assistant IA template
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="neo-btn-ghost neo-btn-sm"
            style={{ padding: '2px 6px' }}
            title="Réduire"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => { setHistory([]); setMessage('') }}
            className="neo-btn-ghost neo-btn-sm"
            style={{ padding: '2px 6px', color: 'var(--muted)' }}
            title="Effacer l'historique"
          >
            <XIcon size={13} />
          </button>
        </div>

        {/* Historique */}
        {history.length > 0 && (
          <div ref={scrollRef} style={historyStyle}>
            {history.map(m => (
              <div key={m.id} style={{
                ...messageStyle,
                background: m.role === 'user' ? 'var(--primary-soft, #FEF3C7)' : 'transparent',
                borderLeft: m.role === 'user' ? 'none' : '2px solid #EAB308',
                paddingLeft: m.role === 'user' ? 10 : 8,
                marginLeft: m.role === 'user' ? 32 : 0,
                marginRight: m.role === 'user' ? 0 : 32,
              }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                  {m.role === 'user' ? 'Toi' : '🤖 Assistant'}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                {m.response && (m.response.type === 'unsupported' || (m.response.type === 'action' && m.response.unsupported)) && (
                  <button
                    type="button"
                    onClick={() => reportFeatureRequest(m.response!, history.find(h => h.id === m.id.replace('a-', 'u-'))?.text || '')}
                    style={featureBtnStyle}
                  >
                    <MessageSquarePlus size={11} />
                    Suggérer cette feature
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {history.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 12px 0' }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => send(s)}
                disabled={loading}
                style={suggestionStyle}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={inputContainerStyle}>
          <textarea
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
              if (e.key === 'Escape') setExpanded(false)
            }}
            placeholder={selectedFieldId
              ? 'Ex : « Rends ce champ obligatoire si Suisse »'
              : 'Ex : « Crée une étape Conjoint avec les champs du conjoint »'}
            rows={1}
            style={textareaStyle}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={loading || !message.trim()}
            className="neo-btn-yellow"
            style={{ padding: '8px 14px', opacity: (loading || !message.trim()) ? 0.5 : 1 }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Envoyer
          </button>
        </div>
      </div>,
      document.body,
      )}

      {/* Modal portalisé : confirmation des changements */}
      {pendingChanges && createPortal(
        <PendingChangesModal
          pending={pendingChanges}
          onApply={applyPending}
          onCancel={() => setPendingChanges(null)}
        />,
        document.body,
      )}
    </>
  )
}

// ─── Modal de confirmation ──────────────────────────────────────────
function PendingChangesModal({
  pending, onApply, onCancel,
}: {
  pending: { explanation: string; changes: TemplateChange[]; unsupported?: string }
  onApply: () => void
  onCancel: () => void
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(700px, 95vw)',
        maxHeight: '88vh',
        background: 'var(--card)',
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Sparkles size={18} style={{ color: '#EAB308', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-instrument-serif), Georgia, serif',
              fontSize: 22, fontWeight: 400, lineHeight: 1.15, color: 'var(--foreground)',
            }}>
              Confirmer les modifications
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
              {pending.changes.length} change{pending.changes.length > 1 ? 's' : ''} proposé{pending.changes.length > 1 ? 's' : ''} par l'assistant
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '1px solid var(--border)', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--muted)',
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Explanation */}
          <div style={{
            padding: '12px 14px',
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 8,
            fontSize: 13, lineHeight: 1.5, color: 'var(--foreground)',
            marginBottom: 16,
          }}>
            {pending.explanation}
          </div>

          {/* Unsupported warning si présent */}
          {pending.unsupported && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(234,179,8,0.10)',
              border: '1px solid rgba(234,179,8,0.40)',
              borderRadius: 8,
              fontSize: 12, lineHeight: 1.5, color: '#A16207',
              marginBottom: 16,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Partiellement appliqué :</strong> {pending.unsupported}
              </div>
            </div>
          )}

          {/* Liste des changes */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Détails des modifications
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.changes.map((ch, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                background: 'var(--surface-2, #F9FAFB)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12, lineHeight: 1.4,
                fontFamily: 'ui-monospace, monospace',
                color: 'var(--foreground)',
              }}>
                <div style={{ fontWeight: 700, color: '#7C3AED', marginBottom: 3 }}>{ch.op}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {summarizeChange(ch)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer', color: 'var(--muted)',
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onApply}
            className="neo-btn-yellow"
            style={{ padding: '8px 18px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Check size={14} />
            Appliquer ({pending.changes.length})
          </button>
        </div>
      </div>
    </div>
  )
}

function summarizeChange(ch: TemplateChange): string {
  switch (ch.op) {
    case 'set_required': return `field=${ch.fieldId.slice(0, 12)}… → required=${ch.value}`
    case 'set_label': return `field=${ch.fieldId.slice(0, 12)}… → label="${ch.label}"`
    case 'add_condition': return `field=${ch.fieldId.slice(0, 12)}… + condition (${ch.condition.action} si ${ch.condition.triggerFieldId.slice(0, 10)}… ${ch.condition.operator} ${ch.condition.value || ''})`
    case 'remove_condition': return `field=${ch.fieldId.slice(0, 12)}… − condition #${ch.conditionIndex}`
    case 'set_help_text': return `field=${ch.fieldId.slice(0, 12)}… → helpText="${ch.helpText.slice(0, 50)}…"`
    case 'set_section': return `field=${ch.fieldId.slice(0, 12)}… → section="${ch.section}"`
    case 'set_section_description': return `section="${ch.section}" → description="${ch.description.slice(0, 40)}…"`
    case 'move_to_step': return `field=${ch.fieldId.slice(0, 12)}… → étape ${ch.stepId.slice(0, 14)}…`
    case 'create_step': return `nouvelle étape "${ch.title}" (${ch.fieldIds.length} champs)`
    case 'set_default_checked': return `field=${ch.fieldId.slice(0, 12)}… → coché par défaut=${ch.value}`
    case 'group_fields': return `groupe ${ch.fieldIds.length} fields (${ch.rule}, count=${ch.count})`
  }
}

// ─── Styles ─────────────────────────────────────────────────────────
const collapsedStyle: React.CSSProperties = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  height: 48, zIndex: 40,
  background: 'var(--card)', borderTop: '1px solid var(--border)',
  display: 'flex', alignItems: 'center',
  padding: '0 16px',
  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
}
const collapsedButtonStyle: React.CSSProperties = {
  width: '100%', height: 36,
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '0 14px',
  background: 'var(--surface-2, #F9FAFB)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: 12.5,
  fontFamily: 'inherit',
}
const expandedStyle: React.CSSProperties = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  zIndex: 40,
  background: 'var(--card)', borderTop: '1px solid var(--border)',
  boxShadow: '0 -8px 24px rgba(0,0,0,0.08)',
  display: 'flex', flexDirection: 'column',
  maxHeight: 320,
  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
  contain: 'layout style',
}
const headerStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--surface-2, #F9FAFB)',
  flexShrink: 0,
}
const historyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 12px',
  display: 'flex', flexDirection: 'column', gap: 8,
  minHeight: 0,
  maxHeight: 180,
}
const messageStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
}
const suggestionStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11, fontWeight: 500,
  background: 'var(--surface-2, #F9FAFB)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  cursor: 'pointer',
  color: 'var(--muted)',
  fontFamily: 'inherit',
}
const inputContainerStyle: React.CSSProperties = {
  display: 'flex', gap: 8,
  padding: 12,
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
}
const textareaStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'none',
  background: 'var(--background)',
  color: 'var(--foreground)',
  outline: 'none',
  lineHeight: 1.4,
  maxHeight: 80,
}
const featureBtnStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '3px 8px',
  fontSize: 10.5, fontWeight: 600,
  background: 'rgba(234,179,8,0.10)',
  color: '#A16207',
  border: '1px solid rgba(234,179,8,0.35)',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
