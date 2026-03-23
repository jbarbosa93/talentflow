'use client'
import { useState, useRef, useEffect } from 'react'
import { Mail, Plus, Trash2, Send, FileText, MessageCircle, Smartphone, AlertCircle, ExternalLink, Copy, Check, Search, X, Users } from 'lucide-react'
import EmailChipInput from '@/components/EmailChipInput'
import MultiCandidatSearch from '@/components/MultiCandidatSearch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEmailTemplates, useCreateTemplate, useSendEmail } from '@/hooks/useMessages'
import { useCandidats } from '@/hooks/useCandidats'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'

const CAT_LABELS: Record<string, string> = {
  invitation_entretien: 'Entretien',
  relance: 'Relance',
  refus: 'Refus',
  offre: 'Offre',
  general: 'Général',
}
const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  invitation_entretien: { bg: '#FFF7ED', color: '#F5A623' },
  relance:              { bg: '#EFF6FF', color: '#3B82F6' },
  refus:                { bg: '#FEF2F2', color: '#EF4444' },
  offre:                { bg: '#F0FDF4', color: '#22C55E' },
  general:              { bg: 'var(--secondary)', color: 'var(--muted)' },
}

type TabId = 'email' | 'whatsapp' | 'sms' | 'templates'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'email',     label: 'Email',          icon: Mail },
  { id: 'whatsapp',  label: 'WhatsApp',        icon: MessageCircle },
  { id: 'sms',       label: 'SMS / iMessage',  icon: Smartphone },
  { id: 'templates', label: 'Templates',       icon: FileText },
]

export default function MessagesPage() {
  const [tab, setTab] = useState<TabId>('email')

  return (
    <div className="d-page" style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Messages</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>Contactez vos candidats par email, WhatsApp ou SMS</p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'var(--secondary)', border: '1.5px solid var(--border)',
        borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 24,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
              background: tab === t.id ? 'var(--card)' : 'transparent',
              color: tab === t.id ? 'var(--foreground)' : 'var(--muted)',
              boxShadow: tab === t.id ? 'var(--card-shadow)' : 'none',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'email'     && <EmailTab />}
      {tab === 'whatsapp'  && <WhatsAppTab />}
      {tab === 'sms'       && <SmsTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}

// ─── Candidat Search ──────────────────────────────────────────────────────────

function CandidatSearch({
  candidats,
  value,
  onChange,
  placeholder = 'Rechercher un candidat...',
}: {
  candidats: any[] | undefined
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = candidats?.find(c => c.id === value)

  useEffect(() => {
    if (selected) {
      setSelectedLabel(`${selected.prenom} ${selected.nom}`)
      setQuery('')
    } else {
      setSelectedLabel('')
    }
  }, [value, selected])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = (candidats || []).filter(c => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      c.nom?.toLowerCase().includes(q) ||
      c.prenom?.toLowerCase().includes(q) ||
      c.telephone?.includes(q)
    )
  }).slice(0, 20)

  const handleSelect = (c: any) => {
    onChange(c.id)
    setSelectedLabel(`${c.prenom} ${c.nom}`)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setSelectedLabel('')
    setQuery('')
    inputRef.current?.focus()
  }

  const displayValue = open ? query : (selectedLabel || '')

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          value={displayValue}
          placeholder={selectedLabel ? selectedLabel : placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQuery('') }}
          style={{
            width: '100%', height: 38, paddingLeft: 32, paddingRight: selectedLabel ? 32 : 10,
            border: '1.5px solid var(--border)', borderRadius: 8,
            background: 'var(--secondary)', color: 'var(--foreground)',
            fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {selectedLabel && (
          <button
            onClick={handleClear}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex' }}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'white', border: '1.5px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Aucun candidat trouvé
            </div>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(c) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', background: c.id === value ? 'var(--primary-soft)' : 'none',
                border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)', textAlign: 'left',
              }}
              onMouseOver={e => { if (c.id !== value) e.currentTarget.style.background = 'var(--secondary)' }}
              onMouseOut={e => { if (c.id !== value) e.currentTarget.style.background = 'none' }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#0F172A', flexShrink: 0,
              }}>
                {((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.prenom} {c.nom}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {c.telephone || 'Sans téléphone'}
                  {c.titre_poste ? ` · ${c.titre_poste}` : ''}
                </div>
              </div>
              {c.id === value && <Check size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Email Tab ────────────────────────────────────────────────────────────────

function EmailTab() {
  const [candidatIds, setCandidatIds] = useState<string[]>([])
  const [templateId, setTemplateId] = useState('')
  const [destinataires, setDestinataires] = useState<string[]>([])
  const [sujet, setSujet] = useState('')
  const [corps, setCorps] = useState('')
  const [sent, setSent] = useState(false)

  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
  const { data: templates } = useEmailTemplates()
  const sendEmail = useSendEmail()

  // Quand on sélectionne des candidats, ajouter leurs emails aux destinataires
  const handleCandidatChange = (ids: string[]) => {
    setCandidatIds(ids)
    const emails = ids
      .map(id => candidats?.find(c => c.id === id)?.email)
      .filter((e): e is string => !!e)
    // Ajouter les nouveaux emails sans supprimer ceux ajoutés manuellement
    setDestinataires(prev => {
      const set = new Set([...prev, ...emails])
      return [...set]
    })
  }

  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    const t = templates?.find((t: any) => t.id === id)
    if (t) {
      const firstCandidat = candidats?.find(c => candidatIds.includes(c.id))
      const prenom = firstCandidat?.prenom || '{{prenom}}'
      const nom = firstCandidat?.nom || '{{nom}}'
      setSujet(t.sujet.replace(/\{\{prenom\}\}/g, prenom).replace(/\{\{nom\}\}/g, nom))
      setCorps(t.corps.replace(/\{\{prenom\}\}/g, prenom).replace(/\{\{nom\}\}/g, nom))
    }
  }

  const handleSend = () => {
    if (destinataires.length === 0 || !sujet || !corps) return
    sendEmail.mutate({
      candidat_ids: candidatIds.length > 0 ? candidatIds : undefined,
      destinataires,
      sujet,
      corps,
      use_bcc: true,
    }, {
      onSuccess: () => {
        setSent(true)
        setTimeout(() => setSent(false), 3000)
        setCorps('')
        setSujet('')
      }
    })
  }

  const labelStyle = { display: 'block' as const, fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Warning */}
      <div style={{ borderRadius: 12, border: '1.5px solid #FDE68A', background: '#FFFBEB', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertCircle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#D97706', margin: 0 }}>Compte Microsoft 365 requis</p>
          <p style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>
            Connectez votre compte Microsoft pour envoyer des emails directement depuis TalentFlow.
          </p>
        </div>
        <Link href="/integrations">
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #FDE68A', background: 'transparent', color: '#D97706', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
            <ExternalLink size={12} />Connecter
          </button>
        </Link>
      </div>

      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--card-shadow)' }}>
        {/* Candidats multi-select */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={11} /> Candidats (optionnel)
            </span>
          </label>
          <MultiCandidatSearch
            candidats={candidats as any}
            selectedIds={candidatIds}
            onChange={handleCandidatChange}
            placeholder="Rechercher des candidats à joindre..."
          />
        </div>

        {/* Template */}
        <div>
          <label style={labelStyle}>Template (optionnel)</label>
          <Select value={templateId} onValueChange={handleTemplateChange}>
            <SelectTrigger style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', height: 38 }}>
              <SelectValue placeholder="Charger un template..." />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Destinataires multi-email */}
        <div>
          <label style={labelStyle}>
            Destinataires (CCI) *
            {destinataires.length > 1 && (
              <span style={{ fontWeight: 500, textTransform: 'none', marginLeft: 8, fontSize: 10, color: 'var(--foreground)', background: 'var(--primary-soft)', padding: '1px 6px', borderRadius: 100 }}>
                {destinataires.length} destinataires — envoi en copie cachée
              </span>
            )}
          </label>
          <EmailChipInput
            value={destinataires}
            onChange={setDestinataires}
            placeholder="Ajouter un email (appuyez Entrée)..."
          />
        </div>

        <div>
          <label style={labelStyle}>Sujet *</label>
          <Input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Objet de l'email..." required />
        </div>

        <div>
          <label style={labelStyle}>Message *</label>
          <Textarea
            value={corps}
            onChange={e => setCorps(e.target.value)}
            placeholder="Rédigez votre message..."
            rows={8}
            style={{ resize: 'none', fontFamily: 'monospace', fontSize: 13 }}
          />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Variables : {'{{prenom}}'}, {'{{nom}}'}, {'{{offre}}'}, {'{{date}}'}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={12} />Envoi via Microsoft 365 {destinataires.length > 1 ? '(CCI)' : ''}
          </p>
          <Button onClick={handleSend} disabled={destinataires.length === 0 || !sujet || !corps || sendEmail.isPending || sent}>
            {sent ? (
              <><Check className="w-3.5 h-3.5 mr-2" />Envoyé</>
            ) : (
              <><Send className="w-3.5 h-3.5 mr-2" />{sendEmail.isPending ? 'Envoi...' : `Envoyer${destinataires.length > 1 ? ` (${destinataires.length})` : ''}`}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── WhatsApp Tab ─────────────────────────────────────────────────────────────

function WhatsAppTab() {
  const [candidatId, setCandidatId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [telephone, setTelephone] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
  const { data: templates } = useEmailTemplates()

  const handleCandidatChange = (id: string) => {
    setCandidatId(id)
    const c = candidats?.find(c => c.id === id)
    if (c?.telephone) setTelephone(c.telephone.replace(/\s/g, ''))
  }

  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    const t = templates?.find((t: any) => t.id === id)
    if (t) {
      const c = candidats?.find(c => c.id === candidatId)
      const prenom = c?.prenom || '{{prenom}}'
      const nom = c?.nom || '{{nom}}'
      setMessage(t.corps.replace(/\{\{prenom\}\}/g, prenom).replace(/\{\{nom\}\}/g, nom))
    }
  }

  const toWaPhone = (tel: string) => {
    const clean = tel.replace(/[\s\-\.\(\)]/g, '')
    if (clean.startsWith('+')) return clean.slice(1)
    if (clean.startsWith('00')) return clean.slice(2)
    if (clean.startsWith('0')) return '41' + clean.slice(1)
    return clean
  }
  const waPhone = toWaPhone(telephone)
  const waUrl = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(message)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Message copié')
  }

  return (
    <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--card-shadow)' }}>
      {/* Info */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10 }}>
        <MessageCircle size={16} color="#16A34A" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 12, color: '#166534', margin: 0 }}>
          Composez votre message ici, puis cliquez sur <strong>Ouvrir WhatsApp</strong> — votre app s&apos;ouvrira directement avec le message pré-rempli.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Candidat</label>
          <CandidatSearch candidats={candidats} value={candidatId} onChange={handleCandidatChange} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Template (optionnel)</label>
          <Select value={templateId} onValueChange={handleTemplateChange}>
            <SelectTrigger style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', height: 38 }}>
              <SelectValue placeholder="Charger un template..." />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Numéro de téléphone</label>
        <Input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+41 79 000 00 00" />
        {telephone && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Format international détecté : +{waPhone}</p>
        )}
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Message</label>
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Bonjour, nous avons une opportunité qui pourrait vous intéresser..."
          rows={7}
          style={{ resize: 'none', fontSize: 13 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={!message}>
          {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copié</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copier</>}
        </Button>
        <a
          href={waPhone && message ? waUrl : '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => { if (!waPhone || !message) e.preventDefault() }}
          style={{ marginLeft: 'auto' }}
        >
          <button
            disabled={!waPhone || !message}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: !waPhone || !message ? 'var(--secondary)' : '#25D366',
              color: !waPhone || !message ? 'var(--muted)' : 'white',
              fontSize: 13, fontWeight: 700, cursor: !waPhone || !message ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            <MessageCircle size={14} />Ouvrir WhatsApp
          </button>
        </a>
      </div>
    </div>
  )
}

// ─── SMS / iMessage Tab ────────────────────────────────────────────────────────

function SmsTab() {
  const [candidatId, setCandidatId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [telephone, setTelephone] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
  const { data: templates } = useEmailTemplates()

  const handleCandidatChange = (id: string) => {
    setCandidatId(id)
    const c = candidats?.find(c => c.id === id)
    if (c?.telephone) setTelephone(c.telephone)
  }

  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    const t = templates?.find((t: any) => t.id === id)
    if (t) {
      const c = candidats?.find(c => c.id === candidatId)
      const prenom = c?.prenom || '{{prenom}}'
      const nom = c?.nom || '{{nom}}'
      setMessage(t.corps.replace(/\{\{prenom\}\}/g, prenom).replace(/\{\{nom\}\}/g, nom))
    }
  }

  const smsUrl = `sms:${telephone}${message ? `?body=${encodeURIComponent(message)}` : ''}`

  const handleCopy = () => {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Message copié')
  }

  return (
    <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--card-shadow)' }}>
      {/* Info */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 10 }}>
        <Smartphone size={16} color="#3B82F6" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 12, color: '#1E40AF', margin: 0 }}>
          Composez votre message et cliquez <strong>Ouvrir Messages</strong> — votre app SMS / iMessage s&apos;ouvrira avec le message pré-rempli. Fonctionne sur Mac et iPhone.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Candidat</label>
          <CandidatSearch candidats={candidats} value={candidatId} onChange={handleCandidatChange} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Template (optionnel)</label>
          <Select value={templateId} onValueChange={handleTemplateChange}>
            <SelectTrigger style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', height: 38 }}>
              <SelectValue placeholder="Charger un template..." />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Numéro de téléphone</label>
        <Input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+41 79 000 00 00" />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Message</label>
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Bonjour, nous avons une opportunité qui pourrait vous intéresser..."
          rows={7}
          style={{ resize: 'none', fontSize: 13 }}
        />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{message.length} caractères</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={!message}>
          {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copié</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copier</>}
        </Button>
        <a
          href={telephone ? smsUrl : '#'}
          onClick={e => { if (!telephone) e.preventDefault() }}
          style={{ marginLeft: 'auto' }}
        >
          <button
            disabled={!telephone || !message}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: !telephone || !message ? 'var(--secondary)' : '#34C759',
              color: !telephone || !message ? 'var(--muted)' : 'white',
              fontSize: 13, fontWeight: 700, cursor: !telephone || !message ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            <Smartphone size={14} />Ouvrir Messages
          </button>
        </a>
      </div>
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: templates, isLoading } = useEmailTemplates()
  const queryClient = useQueryClient()

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/email-templates?id=${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success('Template supprimé')
    },
  })

  const grouped = (templates || []).reduce((acc: Record<string, any[]>, t: any) => {
    if (!acc[t.categorie]) acc[t.categorie] = []
    acc[t.categorie].push(t)
    return acc
  }, {})

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau template
        </Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 96, background: 'var(--secondary)', borderRadius: 12, animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <FileText size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>Aucun template</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Créez des templates pour accélérer vos communications</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{CAT_LABELS[cat] || cat}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(items as any[]).map((t: any) => {
                  const catColor = CAT_COLORS[t.categorie] || CAT_COLORS.general
                  return (
                    <div key={t.id} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--card-shadow)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{t.nom}</h3>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: catColor.bg, color: catColor.color }}>
                              {CAT_LABELS[t.categorie] || t.categorie}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t.sujet}</p>
                        </div>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--muted)' }}
                          onClick={() => deleteTemplate.mutate(t.id)}
                          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontFamily: 'monospace', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{t.corps}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau template</DialogTitle>
          </DialogHeader>
          <CreateTemplateForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateTemplateForm({ onSuccess }: { onSuccess: () => void }) {
  const [nom, setNom] = useState('')
  const [sujet, setSujet] = useState('')
  const [corps, setCorps] = useState('')
  const [categorie, setCategorie] = useState('general')
  const createTemplate = useCreateTemplate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createTemplate.mutate({ nom, sujet, corps, categorie }, { onSuccess })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Nom du template *</label>
          <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: Invitation entretien" required />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Catégorie</label>
          <Select value={categorie} onValueChange={setCategorie}>
            <SelectTrigger style={{ height: 38 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CAT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Sujet (email)</label>
        <Input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Objet de l'email..." />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Corps du message *</label>
        <Textarea value={corps} onChange={e => setCorps(e.target.value)} placeholder="Bonjour {{prenom}},..." rows={6} required style={{ resize: 'none', fontFamily: 'monospace', fontSize: 13 }} />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Variables : {'{{prenom}}'}, {'{{nom}}'}, {'{{offre}}'}, {'{{date}}'}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="submit" disabled={!nom || !corps || createTemplate.isPending}>
          {createTemplate.isPending ? 'Création...' : 'Créer le template'}
        </Button>
      </div>
    </form>
  )
}
