'use client'
import { useState } from 'react'
import { Mail, Plus, Trash2, Send, FileText } from 'lucide-react'
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

const CAT_LABELS: Record<string, string> = {
  invitation_entretien: 'Entretien',
  relance: 'Relance',
  refus: 'Refus',
  offre: 'Offre',
  general: 'Général',
}
const CAT_COLORS: Record<string, string> = {
  invitation_entretien: 'bg-primary/15 text-primary',
  relance: 'bg-sky-500/15 text-sky-400',
  refus: 'bg-rose-500/15 text-rose-400',
  offre: 'bg-emerald-500/15 text-emerald-400',
  general: 'bg-white/8 text-white/40',
}

export default function MessagesPage() {
  const [tab, setTab] = useState<'envoyer' | 'templates'>('envoyer')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Messages</h1>
        <p className="text-sm text-white/40 mt-0.5">Envoyez des emails via votre compte Microsoft 365</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/6 rounded-lg p-1 w-fit mb-6">
        {([
          { id: 'envoyer', label: 'Envoyer un email', icon: Send },
          { id: 'templates', label: 'Templates', icon: FileText },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-white/8 text-white shadow-sm' : 'text-white/35 hover:text-white/60'}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'envoyer' && <SendEmailTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}

function SendEmailTab() {
  const [candidatId, setCandidatId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [destinataire, setDestinataire] = useState('')
  const [sujet, setSujet] = useState('')
  const [corps, setCorps] = useState('')
  const [sent, setSent] = useState(false)

  const { data: candidats } = useCandidats()
  const { data: templates } = useEmailTemplates()
  const sendEmail = useSendEmail()

  const handleCandidatChange = (id: string) => {
    setCandidatId(id)
    const c = candidats?.find(c => c.id === id)
    if (c?.email) setDestinataire(c.email)
  }

  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    const t = templates?.find((t: any) => t.id === id)
    if (t) {
      setSujet(t.sujet)
      setCorps(t.corps)
    }
  }

  const handleSend = () => {
    if (!destinataire || !sujet || !corps) return
    sendEmail.mutate({ candidat_id: candidatId || undefined, destinataire, sujet, corps }, {
      onSuccess: () => {
        setSent(true)
        setTimeout(() => setSent(false), 3000)
        setCorps('')
        setSujet('')
      }
    })
  }

  return (
    <div className="rounded-xl border border-white/6 bg-card p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/40">Candidat (optionnel)</Label>
          <Select value={candidatId} onValueChange={handleCandidatChange}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/60 h-9">
              <SelectValue placeholder="Sélectionner un candidat..." />
            </SelectTrigger>
            <SelectContent>
              {candidats?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.prenom} {c.nom} {c.email ? `(${c.email})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/40">Template (optionnel)</Label>
          <Select value={templateId} onValueChange={handleTemplateChange}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/60 h-9">
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

      <div className="space-y-1.5">
        <Label className="text-xs text-white/40">Destinataire *</Label>
        <Input value={destinataire} onChange={e => setDestinataire(e.target.value)} placeholder="email@exemple.com" type="email" required className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-white/40">Sujet *</Label>
        <Input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Objet de l'email..." required className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-white/40">Message *</Label>
        <Textarea
          value={corps}
          onChange={e => setCorps(e.target.value)}
          placeholder="Rédigez votre message..."
          rows={8}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/20 resize-none font-mono text-sm"
        />
        <p className="text-[10px] text-white/20">Variables disponibles : {'{{prenom}}'}, {'{{nom}}'}, {'{{offre}}'}, {'{{date}}'}</p>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-white/25">Envoi via votre compte Microsoft 365</p>
        <Button onClick={handleSend} disabled={!destinataire || !sujet || !corps || sendEmail.isPending || sent}>
          {sent ? (
            <><Mail className="w-3.5 h-3.5 mr-2" />Envoyé</>
          ) : (
            <>
              <Send className="w-3.5 h-3.5 mr-2" />
              {sendEmail.isPending ? 'Envoi...' : 'Envoyer'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

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
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-white/5 animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-2">{CAT_LABELS[cat] || cat}</p>
              <div className="space-y-2">
                {(items as any[]).map((t: any) => (
                  <div key={t.id} className="rounded-xl border border-white/6 bg-card p-4 hover:border-white/10 transition-colors group">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white/70">{t.nom}</h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CAT_COLORS[t.categorie] || CAT_COLORS.general}`}>
                            {CAT_LABELS[t.categorie] || t.categorie}
                          </span>
                        </div>
                        <p className="text-xs text-white/35 mt-0.5">{t.sujet}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-white/20 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        onClick={() => deleteTemplate.mutate(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-white/25 leading-relaxed line-clamp-2 font-mono">{t.corps}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg bg-card border-white/10">
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/40">Nom du template *</Label>
          <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: Invitation entretien" required className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/40">Catégorie</Label>
          <Select value={categorie} onValueChange={setCategorie}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/60 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CAT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-white/40">Sujet *</Label>
        <Input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Objet de l'email..." required className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-white/40">Corps du message *</Label>
        <Textarea value={corps} onChange={e => setCorps(e.target.value)} placeholder="Bonjour {{prenom}},..." rows={6} required className="bg-white/5 border-white/10 text-white placeholder:text-white/20 resize-none font-mono text-sm" />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!nom || !sujet || !corps || createTemplate.isPending}>
          {createTemplate.isPending ? 'Création...' : 'Créer le template'}
        </Button>
      </div>
    </form>
  )
}
