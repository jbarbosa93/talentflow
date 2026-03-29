'use client'
import { useState, useEffect } from 'react'
import { Send, FileText, CheckCircle2, AlertCircle, Loader2, Info, ChevronDown, Clock, History } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { FT_TEMPLATES, FT_TEMPLATE_VIDE, type FTTemplate } from '@/lib/ft-templates'

const supabase = createClient()

// Fixe — ne change jamais
const NOMBRE_POSTES = '2'
const CONTACT_INFO  = '+41 24 552 18 70  info@l-agence.ch'

type FTForm = FTTemplate & { infos_complementaires: string; prise_de_poste: string }

const DEFAULT: FTForm = {
  ...FT_TEMPLATE_VIDE,
  infos_complementaires: '',
  prise_de_poste: '',
}

const lbl = (txt: string, required = false) => (
  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>
    {txt}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
  </label>
)

export default function FranceTravailComposer() {
  const [form, setForm] = useState<FTForm>(DEFAULT)
  const [templateKey, setTemplateKey] = useState<string>('__vide__')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [historique, setHistorique] = useState<any[]>([])
  const [showHistorique, setShowHistorique] = useState(false)

  useEffect(() => {
    ;(supabase as any)
      .from('activites')
      .select('id, titre, description, created_at, metadata')
      .eq('type', 'email_envoye')
      .filter('metadata->>source', 'eq', 'france_travail')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }: { data: any[] | null }) => { if (data) setHistorique(data) })
  }, [sent])

  const set = (k: keyof FTForm, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const loadTemplate = (val: string) => {
    setTemplateKey(val)
    if (val === '__vide__') {
      setForm({ ...FT_TEMPLATE_VIDE, infos_complementaires: '', prise_de_poste: '' })
      return
    }
    const tpl = FT_TEMPLATES.find(t => t.titre === val)
    if (tpl) setForm({ ...tpl, infos_complementaires: '', prise_de_poste: '' })
  }

  const handleSend = async () => {
    if (!form.titre.trim())       { toast.error('Titre du poste obligatoire'); return }
    if (!form.description.trim()) { toast.error('Description des tâches obligatoire'); return }
    if (!form.lieu.trim())        { toast.error('Lieu de travail obligatoire'); return }

    setSending(true)
    setError('')
    try {
      const payload = {
        ...form,
        nombre_postes: NOMBRE_POSTES,
        contact_direct: true,
        contact_info: CONTACT_INFO,
        salaire_de: '',
        salaire_a: '',
      }
      const res = await fetch('/api/annonces/france-travail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setSent(true)
      toast.success('Formulaire envoyé à France Travail !')
    } catch (e: any) {
      setError(e.message)
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  const inp = { height: 32, fontSize: 13 }

  if (sent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 24px' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={32} color="#059669" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)' }}>Formulaire envoyé ✓</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
            Le document Word a été envoyé à <strong>pei.74041@pole-emploi.fr</strong><br/>
            avec copie à <strong>andre.bonier@pole-emploi.fr</strong>
          </p>
        </div>
        <button className="neo-btn-outline" onClick={() => { setSent(false); setForm(DEFAULT); setTemplateKey('__vide__') }}>
          Nouvelle annonce
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 48px' }}>

      {/* Bannière info */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#EEF2FF', border: '1.5px solid #C7D2FE', marginBottom: 20 }}>
        <Info size={15} style={{ color: '#4F46E5', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#3730A3', lineHeight: 1.6 }}>
          Choisis un métier → tout se pré-remplit → ajuste si besoin → envoyer.<br/>
          <strong>2 postes</strong> inscrits automatiquement · candidatures → <strong>info@l-agence.ch</strong>
        </div>
      </div>

      {/* ── SÉLECTEUR DE TEMPLATE ────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '16px 24px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            {lbl('Choisir un métier existant')}
            <div style={{ position: 'relative' }}>
              <select
                className="neo-input"
                style={{ ...inp, paddingRight: 36, appearance: 'none', cursor: 'pointer', fontWeight: templateKey !== '__vide__' ? 700 : 400 }}
                value={templateKey}
                onChange={e => loadTemplate(e.target.value)}
              >
                <option value="__vide__">— Nouveau poste (formulaire vide) —</option>
                {FT_TEMPLATES.map(t => (
                  <option key={t.titre} value={t.titre}>{t.titre}</option>
                ))}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            </div>
          </div>
          {templateKey !== '__vide__' && (
            <div style={{ paddingTop: 18 }}>
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#D1FAE5', color: '#065F46', fontWeight: 700 }}>
                ✓ Template chargé — modifie si besoin
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── L'EMPLOI OFFERT ─────────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={14} style={{ color: '#4F46E5' }} /> L'EMPLOI OFFERT
        </h3>
        <div style={{ marginBottom: 12 }}>
          {lbl('Intitulé du poste', true)}
          <input className="neo-input" style={inp} placeholder="ex: Soudeur TIG 141-136" value={form.titre} onChange={e => set('titre', e.target.value)} />
        </div>
        <div>
          {lbl('Description des tâches', true)}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Maximum 1000 caractères — une tâche par ligne</div>
          <textarea
            className="neo-input"
            style={{ minHeight: 150, fontSize: 13, resize: 'vertical', lineHeight: 1.6 }}
            placeholder={'Lire et interpréter les instructions techniques\nDéterminer la technique appropriée\nContrôler la qualité\nRespecter les consignes de sécurité'}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            maxLength={1000}
          />
          <div style={{ fontSize: 10, color: form.description.length > 900 ? '#EF4444' : 'var(--muted)', textAlign: 'right', marginTop: 2 }}>
            {form.description.length}/1000
          </div>
        </div>
      </div>

      {/* ── LE PROFIL RECHERCHÉ ─────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>👤 LE PROFIL RECHERCHÉ</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            {lbl('Qualification')}
            <input className="neo-input" style={inp} value={form.qualification} onChange={e => set('qualification', e.target.value)} />
          </div>
          <div>
            {lbl('Formation / Diplômes')}
            <input className="neo-input" style={inp} placeholder="ex: CAP Soudure, BEP…" value={form.formation} onChange={e => set('formation', e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {lbl('Connaissances particulières (langues, permis…)')}
          <input className="neo-input" style={inp} value={form.connaissances} onChange={e => set('connaissances', e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          {lbl('Expérience professionnelle')}
          <input className="neo-input" style={inp} value={form.experience} onChange={e => set('experience', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.debutant} onChange={e => set('debutant', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            Débutant accepté
          </label>
          {!form.debutant && (<>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="exp_type" checked={form.exp_type === 'exigee'} onChange={() => set('exp_type', 'exigee')} style={{ accentColor: 'var(--primary)' }} />
              Exigée
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="exp_type" checked={form.exp_type === 'souhaitee'} onChange={() => set('exp_type', 'souhaitee')} style={{ accentColor: 'var(--primary)' }} />
              Souhaitée
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="neo-input" style={{ height: 30, width: 70, fontSize: 13 }} placeholder="5-10" value={form.exp_annees} onChange={e => set('exp_annees', e.target.value)} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>an(s)</span>
            </div>
          </>)}
        </div>
      </div>

      {/* ── LES CONDITIONS D'EMPLOI ─────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>📋 LES CONDITIONS D'EMPLOI</h3>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <input type="radio" name="contrat" checked={form.contrat === 'cdi'} onChange={() => set('contrat', 'cdi')} style={{ accentColor: 'var(--primary)' }} />
            CDI
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <input type="radio" name="contrat" checked={form.contrat === 'cdd'} onChange={() => set('contrat', 'cdd')} style={{ accentColor: 'var(--primary)' }} />
            CDD
          </label>
          {form.contrat === 'cdd' && (
            <input className="neo-input" style={{ height: 30, fontSize: 13, width: 220 }} placeholder="Durée (ex: Poste à l'année)" value={form.duree_cdd} onChange={e => set('duree_cdd', e.target.value)} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            {lbl('Horaire (Début – Fin)')}
            <input className="neo-input" style={inp} value={form.horaire} onChange={e => set('horaire', e.target.value)} />
          </div>
          <div>
            {lbl('Heures / semaine')}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="neo-input" style={{ ...inp, flex: 1 }} value={form.heures_hebdo} onChange={e => set('heures_hebdo', e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={form.temps_partiel} onChange={e => set('temps_partiel', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                Temps partiel
              </label>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {lbl('Précisions horaires')}
          <input className="neo-input" style={inp} value={form.precision_horaires} onChange={e => set('precision_horaires', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
          <div>
            {lbl('Lieu de travail', true)}
            <input className="neo-input" style={inp} placeholder="ex: Valais – Vaud" value={form.lieu} onChange={e => set('lieu', e.target.value)} />
          </div>
          <div>
            {lbl('Prise de poste')}
            <input className="neo-input" style={{ ...inp, width: 160 }} type="date" value={form.prise_de_poste} onChange={e => set('prise_de_poste', e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── INFOS COMPLÉMENTAIRES ────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>📝 INFOS COMPLÉMENTAIRES</h3>
        {lbl('Nom du client final et secteur d\'activité (cabinet de recrutement)')}
        <input className="neo-input" style={inp} placeholder="ex: Client : Société ABC — Secteur : Industrie métallurgique" value={form.infos_complementaires} onChange={e => set('infos_complementaires', e.target.value)} />
      </div>

      {/* ── HISTORIQUE ──────────────────────────────────────────────────── */}
      {historique.length > 0 && (
        <div className="neo-card" style={{ padding: '14px 20px', marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setShowHistorique(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
          >
            <History size={14} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
              Historique des envois ({historique.length})
            </span>
            <ChevronDown size={13} style={{ color: 'var(--muted)', marginLeft: 'auto', transform: showHistorique ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {showHistorique && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {historique.map((h: any) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--background)', border: '1.5px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.metadata?.titre || h.titre?.replace('Offre France Travail envoyée — ', '')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {h.metadata?.lieu && <span>{h.metadata.lieu} · </span>}
                      {h.metadata?.nombre_postes && <span>{h.metadata.nombre_postes} postes · </span>}
                      <span style={{ color: '#4F46E5' }}>envoyé à pei.74041@pole-emploi.fr</span>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={11} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' '}
                      {new Date(h.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: '#FEE2E2', border: '1.5px solid #FECACA', marginBottom: 16 }}>
          <AlertCircle size={14} color="#DC2626" />
          <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="neo-btn-yellow"
          style={{ padding: '10px 28px', fontSize: 14, fontWeight: 700, gap: 8 }}
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending ? 'Envoi en cours…' : 'Générer et envoyer à France Travail'}
        </button>
      </div>
    </div>
  )
}
