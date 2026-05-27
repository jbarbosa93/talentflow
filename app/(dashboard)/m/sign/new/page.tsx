'use client'
// TalentFlow Mobile /m/sign/new — Envoi rapide via template (v2.9.72)
// Choisir un template existant + saisir destinataires + envoyer en un tap.
// Pas d'éditeur de champs (utiliser desktop pour ça).
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, FileSignature } from 'lucide-react'
import MHeader from '../../_components/MHeader'

interface TemplateRow {
  id: string
  name: string
  description?: string | null
  kind?: string | null
  parent_template_id?: string | null
  recipients_schema?: Array<{ role?: string; order?: number; roleName?: string }>
}

interface RecipientForm {
  name: string
  firstName?: string
  lastName?: string
  email: string
  phone?: string
  role: string
  roleName: string
  order: number
}

function NewSignInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const candidateId = searchParams?.get('candidate_id') || null

  const [step, setStep] = useState<'pick' | 'fill'>('pick')
  const [searchTpl, setSearchTpl] = useState('')
  const [chosen, setChosen] = useState<TemplateRow | null>(null)
  const [title, setTitle] = useState('')
  const [recipients, setRecipients] = useState<RecipientForm[]>([])
  const [pending, setPending] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  // Liste templates (filtrée pour kind=envelope, non ad-hoc)
  const { data: tplData, isLoading: tplLoading } = useQuery<{ templates: TemplateRow[] }>({
    queryKey: ['m', 'templates'],
    queryFn: async () => {
      const r = await fetch('/api/sign/templates', { credentials: 'include' })
      if (!r.ok) return { templates: [] }
      return r.json()
    },
  })

  // Pré-charger candidat si query param
  const { data: candData } = useQuery({
    queryKey: ['m', 'candidat-light', candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const r = await fetch(`/api/candidats/${candidateId}`, { credentials: 'include' })
      if (!r.ok) return null
      return r.json() as Promise<{ candidat: { id: string; nom?: string; prenom?: string; email?: string; telephone?: string } }>
    },
  })

  const visibleTemplates = useMemo(() => {
    const list = (tplData?.templates || [])
      .filter(t => !t.parent_template_id) // exclut ad-hoc
      .filter(t => (t.kind || 'envelope') === 'envelope') // exclut rapports
    if (!searchTpl.trim()) return list
    const q = searchTpl.toLowerCase()
    return list.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    )
  }, [tplData, searchTpl])

  // Quand template choisi : initialise les destinataires depuis recipients_schema
  useEffect(() => {
    if (!chosen) return
    const schema = chosen.recipients_schema || [{ role: 'signer', order: 0, roleName: 'Destinataire' }]
    const cand = candData?.candidat
    const initRecipients: RecipientForm[] = schema.map((s, idx) => {
      const isCandidate = (s.roleName?.toLowerCase().includes('candidat')) ||
                          (s.role === 'signer' && idx === 0 && !!cand)
      return {
        name: isCandidate && cand ? `${cand.prenom || ''} ${cand.nom || ''}`.trim() : '',
        firstName: isCandidate && cand ? (cand.prenom || '') : undefined,
        lastName: isCandidate && cand ? (cand.nom || '') : undefined,
        email: isCandidate && cand ? (cand.email || '') : '',
        phone: isCandidate && cand ? (cand.telephone || '') : '',
        role: s.role || 'signer',
        roleName: s.roleName || `Rôle ${idx + 1}`,
        order: s.order ?? idx,
      }
    })
    setRecipients(initRecipients)
    setTitle(chosen.name)
  }, [chosen, candData])

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(null), 3500)
  }

  async function submit(sendNow: boolean) {
    if (!chosen) return
    if (!title.trim()) { showFlash('Titre requis'); return }
    for (const r of recipients) {
      if (!r.name.trim() || !r.email.trim()) {
        showFlash(`Nom + email requis pour ${r.roleName}`)
        return
      }
    }
    setPending(true)
    try {
      const createRes = await fetch('/api/sign/envelopes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          template_id: chosen.id,
          candidate_id: candidateId,
          recipients,
        }),
      })
      const j = await createRes.json()
      if (!createRes.ok || !j?.envelope?.id) {
        showFlash(j.error || 'Erreur création')
        setPending(false)
        return
      }
      const envId = j.envelope.id as string

      if (sendNow) {
        const sendRes = await fetch(`/api/sign/envelopes/${envId}/send`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!sendRes.ok) {
          const e = await sendRes.json().catch(() => ({}))
          showFlash(`Brouillon créé mais envoi échoué : ${e.error || 'erreur'}`)
          router.push(`/m/sign/${envId}`)
          return
        }
      }
      router.push(`/m/sign/${envId}`)
    } catch {
      showFlash('Erreur réseau')
      setPending(false)
    }
  }

  if (step === 'pick') {
    return (
      <>
        <MHeader title="Nouvelle signature" back="/m/sign" />
        <div className="m-content">
          <div style={{ fontSize: 13, color: 'var(--m-text-soft)', marginBottom: 12 }}>
            Choisis un template existant. L'éditeur de champs reste sur desktop.
          </div>
          <div className="m-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Rechercher un template..."
              value={searchTpl}
              onChange={(e) => setSearchTpl(e.target.value)}
            />
          </div>
          {tplLoading && <div className="m-loading">Chargement des templates...</div>}
          {!tplLoading && visibleTemplates.length === 0 && (
            <div className="m-empty">
              <div className="m-empty-emoji">📄</div>
              <div>Aucun template. Crée-en un depuis desktop.</div>
            </div>
          )}
          {visibleTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="m-card"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => { setChosen(t); setStep('fill') }}
            >
              <div className="m-avatar"><FileSignature size={20} /></div>
              <div className="m-card-body">
                <div className="m-card-title">{t.name}</div>
                {t.description && <div className="m-card-sub">{t.description}</div>}
                <div className="m-card-meta">
                  {(t.recipients_schema?.length || 0)} destinataire{(t.recipients_schema?.length || 0) > 1 ? 's' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
        {flash && <div className="m-flash">{flash}</div>}
      </>
    )
  }

  // Step 'fill'
  return (
    <>
      <MHeader title="Nouvelle signature" back="/m/sign" />
      <div className="m-content">
        <button
          type="button"
          onClick={() => setStep('pick')}
          style={{ background: 'none', border: 'none', color: 'var(--m-text-soft)', fontSize: 13, padding: 0, marginBottom: 12, cursor: 'pointer' }}
        >
          ← Changer de template
        </button>

        <div className="m-form-group">
          <label htmlFor="m-title">Titre de l'enveloppe</label>
          <input
            id="m-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. Contrat Pedro Ferreira"
          />
        </div>

        <div className="m-section-title">Destinataires</div>
        {recipients.map((r, idx) => (
          <div key={idx} className="m-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--m-text-soft)', textTransform: 'uppercase' }}>
              {r.roleName}
            </div>
            <div className="m-form-group" style={{ marginBottom: 0 }}>
              <label>Nom complet</label>
              <input
                type="text"
                value={r.name}
                onChange={(e) => setRecipients(arr => arr.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                placeholder="Prénom Nom"
                autoComplete="name"
              />
            </div>
            <div className="m-form-group" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input
                type="email"
                value={r.email}
                onChange={(e) => setRecipients(arr => arr.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))}
                placeholder="adresse@email.ch"
                autoComplete="email"
                inputMode="email"
              />
            </div>
            <div className="m-form-group" style={{ marginBottom: 0 }}>
              <label>Téléphone (optionnel)</label>
              <input
                type="tel"
                value={r.phone || ''}
                onChange={(e) => setRecipients(arr => arr.map((x, i) => i === idx ? { ...x, phone: e.target.value } : x))}
                placeholder="+41 79 ..."
                autoComplete="tel"
                inputMode="tel"
              />
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="m-btn primary full"
            style={{ marginBottom: 8 }}
          >
            <FileSignature size={16} /> {pending ? 'Envoi...' : 'Créer et envoyer'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(false)}
            className="m-btn secondary full"
          >
            Enregistrer comme brouillon
          </button>
        </div>
      </div>
      {flash && <div className="m-flash">{flash}</div>}
    </>
  )
}

export default function MobileSignNewPage() {
  return (
    <Suspense fallback={<div className="m-loading">Chargement...</div>}>
      <NewSignInner />
    </Suspense>
  )
}
