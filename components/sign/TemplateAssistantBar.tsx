// TalentFlow Sign — Assistant IA template (v2.8.1)
//
// Panneau de chat FLOTTANT : déplaçable (drag header), redimensionnable
// (drag coin bas-droit), minimisable en bulle. Position + taille persistées
// en localStorage. Portalisé via document.body pour échapper aux containing
// blocks Framer Motion (cf. CLAUDE.md pattern #10).
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Sparkles, Send, Loader2, X as XIcon, Minus, AlertTriangle, Check, MessageSquarePlus, Move, Maximize2 } from 'lucide-react'

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
  userMessage?: string  // pour le report feature-request (texte user d'origine)
  timestamp: number
}

interface Props {
  templateId: string
  selectedFieldId?: string | null
  currentMode: 'document' | 'wizard'
  /** Appelé quand user clique "Appliquer" : applique les changes au state. */
  onApplyChanges: (changes: TemplateChange[]) => void
}

// ─── Persistance position + taille ──────────────────────────────────
const STORAGE_KEY = 'tf-assistant-window-v1'
interface WindowState {
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
}
const DEFAULT_STATE = (): WindowState => {
  if (typeof window === 'undefined') {
    return { x: 100, y: 100, width: 420, height: 520, minimized: false }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.max(16, vw - 440),  // bas-droite par défaut
    y: Math.max(16, vh - 540),
    width: 420,
    height: 520,
    minimized: false,
  }
}
function loadState(): WindowState {
  if (typeof window === 'undefined') return DEFAULT_STATE()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE()
    const parsed = JSON.parse(raw) as Partial<WindowState>
    const def = DEFAULT_STATE()
    return {
      x: typeof parsed.x === 'number' ? parsed.x : def.x,
      y: typeof parsed.y === 'number' ? parsed.y : def.y,
      width: typeof parsed.width === 'number' ? parsed.width : def.width,
      height: typeof parsed.height === 'number' ? parsed.height : def.height,
      minimized: !!parsed.minimized,
    }
  } catch {
    return DEFAULT_STATE()
  }
}
function saveState(s: WindowState) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

// ─── Composant principal ────────────────────────────────────────────
export default function TemplateAssistantBar({
  templateId, selectedFieldId, currentMode, onApplyChanges,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [winState, setWinState] = useState<WindowState>(() => DEFAULT_STATE())
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [pendingChanges, setPendingChanges] = useState<{
    explanation: string
    changes: TemplateChange[]
    unsupported?: string
    sourceMessage: string
  } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; mode: 'drag' | 'resize' } | null>(null)

  // Mount + load persistant state (évite mismatch SSR)
  useEffect(() => {
    setMounted(true)
    setWinState(loadState())
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history])

  // Auto-focus à l'ouverture
  useEffect(() => {
    if (!winState.minimized && mounted) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [winState.minimized, mounted])

  // ─── Drag handlers ────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent, mode: 'drag' | 'resize') => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: mode === 'drag' ? winState.x : winState.width,
      origY: mode === 'drag' ? winState.y : winState.height,
      mode,
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = mode === 'drag' ? 'grabbing' : 'nwse-resize'
  }, [winState])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      setWinState(prev => {
        if (d.mode === 'drag') {
          const vw = window.innerWidth
          const vh = window.innerHeight
          const newX = Math.max(8, Math.min(vw - 80, d.origX + dx))  // 80px min visible
          const newY = Math.max(8, Math.min(vh - 80, d.origY + dy))
          return { ...prev, x: newX, y: newY }
        } else {
          const newW = Math.max(320, Math.min(900, d.origX + dx))
          const newH = Math.max(280, Math.min(800, d.origY + dy))
          return { ...prev, width: newW, height: newH }
        }
      })
    }
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        // Persist
        setWinState(s => { saveState(s); return s })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Clamp la position quand le viewport change (resize window)
  useEffect(() => {
    const onResize = () => {
      setWinState(prev => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const x = Math.max(8, Math.min(vw - 80, prev.x))
        const y = Math.max(8, Math.min(vh - 80, prev.y))
        if (x !== prev.x || y !== prev.y) {
          const next = { ...prev, x, y }
          saveState(next)
          return next
        }
        return prev
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ─── Actions ───────────────────────────────────────────────
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
    setHistory(h => [...h.slice(-7), userMsg])
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
        userMessage: msg,
        timestamp: Date.now(),
      }
      setHistory(h => [...h.slice(-7), asstMsg])

      if (parsed.type === 'action' && parsed.changes.length > 0) {
        setPendingChanges({
          explanation: parsed.explanation,
          changes: parsed.changes,
          unsupported: parsed.unsupported,
          sourceMessage: msg,
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

  const reportFeatureRequest = async (msg: ChatMessage) => {
    if (!msg.response) return
    const featureText = msg.response.type === 'unsupported'
      ? msg.response.text
      : msg.response.type === 'action' && msg.response.unsupported
        ? msg.response.unsupported
        : ''
    if (!featureText) return
    try {
      const r = await fetch('/api/feedback/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: featureText,
          context: 'template-editor-assistant',
          userMessage: msg.userMessage || '',
        }),
      })
      if (!r.ok) throw new Error()
      toast.success('💡 Demande enregistrée. João la consultera.')
    } catch {
      toast.error('Impossible d\'enregistrer la demande')
    }
  }

  const setMinimized = (m: boolean) => {
    setWinState(s => {
      const next = { ...s, minimized: m }
      saveState(next)
      return next
    })
  }

  // SSR-safe : ne pas render avant mount (évite décalage position)
  if (!mounted) return null

  // ─── Rendu MINIMISÉ (bulle 56x56) ────────────────────────────
  if (winState.minimized) {
    return createPortal(
      <button
        type="button"
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed',
          left: winState.x,
          top: winState.y,
          width: 56, height: 56,
          borderRadius: '50%',
          background: '#1C1A14',
          color: '#EAB308',
          border: '2px solid #EAB308',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 0 4px rgba(234,179,8,0.20)',
          zIndex: 9998,
          fontFamily: 'inherit',
          transition: 'transform 0.15s',
        }}
        title="Ouvrir l'assistant IA template"
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Sparkles size={22} />
      </button>,
      document.body,
    )
  }

  // ─── Rendu PANNEAU OUVERT (déplaçable + redimensionnable) ────
  return (
    <>
      {createPortal(
        <div
          style={{
            position: 'fixed',
            left: winState.x,
            top: winState.y,
            width: winState.width,
            height: winState.height,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 20px 48px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.10)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9998,
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
          }}
        >
          {/* Header — drag handle */}
          <div
            onMouseDown={e => onMouseDown(e, 'drag')}
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              background: '#1C1A14',
              color: '#fff',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'grab',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            <Move size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
            <Sparkles size={14} style={{ color: '#EAB308', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>
              Assistant IA template
            </span>
            <button
              type="button"
              onClick={() => { setHistory([]); setMessage('') }}
              onMouseDown={e => e.stopPropagation()}
              style={iconBtnStyle}
              title="Effacer l'historique"
            >
              <XIcon size={13} />
            </button>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              onMouseDown={e => e.stopPropagation()}
              style={iconBtnStyle}
              title="Réduire en bulle"
            >
              <Minus size={13} />
            </button>
          </div>

          {/* Historique */}
          {history.length > 0 ? (
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
                      onClick={() => reportFeatureRequest(m)}
                      style={featureBtnStyle}
                    >
                      <MessageSquarePlus size={11} />
                      Suggérer cette feature
                    </button>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--muted)', fontSize: 12, paddingLeft: 8 }}>
                  <Loader2 size={12} className="animate-spin" />
                  Claude réfléchit…
                </div>
              )}
            </div>
          ) : (
            // Suggestions quand pas d'historique
            <div style={{ padding: '16px 12px', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Suggestions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                💡 Astuce : déplace ce panneau en glissant la barre noire du haut. Redimensionne via le coin bas-droit.
              </div>
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
              }}
              placeholder={selectedFieldId
                ? 'Ex : « Rends ce champ obligatoire si Suisse »'
                : 'Ex : « Crée une étape Conjoint »'}
              rows={2}
              style={textareaStyle}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={loading || !message.trim()}
              className="neo-btn-yellow"
              style={{ padding: '8px 12px', opacity: (loading || !message.trim()) ? 0.5 : 1, flexShrink: 0 }}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>

          {/* Resize handle bas-droit */}
          <div
            onMouseDown={e => onMouseDown(e, 'resize')}
            style={{
              position: 'absolute',
              bottom: 0, right: 0,
              width: 18, height: 18,
              cursor: 'nwse-resize',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              padding: 2,
              color: 'var(--muted)',
            }}
            title="Redimensionner"
          >
            <Maximize2 size={11} style={{ transform: 'rotate(90deg)' }} />
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
      position: 'fixed', inset: 0, zIndex: 10000,
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

        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
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
const iconBtnStyle: React.CSSProperties = {
  width: 24, height: 24,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent',
  color: '#9CA3AF',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
}
const historyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 8,
  minHeight: 0,
}
const messageStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
}
const suggestionStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12, fontWeight: 500,
  background: 'var(--surface-2, #F9FAFB)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
  color: 'var(--foreground)',
  fontFamily: 'inherit',
  textAlign: 'left',
}
const inputContainerStyle: React.CSSProperties = {
  display: 'flex', gap: 6, alignItems: 'flex-end',
  padding: 10,
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
}
const textareaStyle: React.CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: 'inherit',
  resize: 'none',
  background: 'var(--background)',
  color: 'var(--foreground)',
  outline: 'none',
  lineHeight: 1.4,
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
