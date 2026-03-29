'use client'
import { useState } from 'react'
import { Send, FileText, CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'

interface FTForm {
  // Emploi
  titre: string
  nombre_postes: string
  description: string
  // Profil
  qualification: string
  formation: string
  connaissances: string
  experience: string
  debutant: boolean
  exp_type: 'exigee' | 'souhaitee'
  exp_annees: string
  // Conditions
  contrat: 'cdi' | 'cdd'
  duree_cdd: string
  horaire: string
  heures_hebdo: string
  temps_partiel: boolean
  precision_horaires: string
  lieu: string
  salaire_de: string
  salaire_a: string
  prise_de_poste: string
  // Service
  contact_direct: boolean
  contact_info: string
  infos_complementaires: string
}

const QUALIFICATIONS = [
  'Ouvrier qualifié', 'Ouvrier spécialisé', 'Technicien', 'Agent de maîtrise',
  'Cadre', 'Ingénieur', 'Non qualifié',
]

const DEFAULT: FTForm = {
  titre: '', nombre_postes: '1', description: '',
  qualification: 'Ouvrier qualifié', formation: '', connaissances: '', experience: '',
  debutant: false, exp_type: 'exigee', exp_annees: '',
  contrat: 'cdi', duree_cdd: '',
  horaire: '', heures_hebdo: '40', temps_partiel: false, precision_horaires: '',
  lieu: '', salaire_de: '', salaire_a: '', prise_de_poste: '',
  contact_direct: true, contact_info: '+41 24 552 18 70  j.barbosa@l-agence.ch',
  infos_complementaires: '',
}

const label = (txt: string, required = false) => (
  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>
    {txt}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
  </label>
)

export default function FranceTravailComposer() {
  const [form, setForm] = useState<FTForm>(DEFAULT)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof FTForm, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSend = async () => {
    if (!form.titre.trim()) { toast.error('Titre du poste obligatoire'); return }
    if (!form.description.trim()) { toast.error('Description des tâches obligatoire'); return }
    if (!form.lieu.trim()) { toast.error('Lieu de travail obligatoire'); return }

    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/annonces/france-travail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  const inputStyle = { height: 32, fontSize: 13 }

  if (sent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 24px' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={32} color="#059669" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)' }}>Formulaire envoyé !</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            Le formulaire Word a été envoyé à <strong>pei.74041@pole-emploi.fr</strong> avec copie à <strong>andre.bonier@pole-emploi.fr</strong>
          </p>
        </div>
        <button className="neo-btn-outline" onClick={() => { setSent(false); setForm(DEFAULT) }}>
          Nouvelle annonce
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 0 40px' }}>
      {/* Info banner */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#EEF2FF', border: '1.5px solid #C7D2FE', marginBottom: 24 }}>
        <Info size={15} style={{ color: '#4F46E5', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#3730A3', lineHeight: 1.6 }}>
          <strong>Comment ça marche :</strong> remplis le formulaire ci-dessous → TalentFlow génère automatiquement le document Word France Travail pré-rempli et l'envoie par mail à leurs deux adresses.
          <br/>Les candidatures arriveront sur <strong>info@l-agence.ch</strong> directement.
        </div>
      </div>

      {/* ── L'EMPLOI OFFERT ──────────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15} style={{ color: '#4F46E5' }} /> L'EMPLOI OFFERT
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
          <div>
            {label('Intitulé du poste', true)}
            <input className="neo-input" style={inputStyle} placeholder="ex: Soudeur TIG 141-136" value={form.titre} onChange={e => set('titre', e.target.value)} />
          </div>
          <div style={{ width: 100 }}>
            {label('Nb de postes', true)}
            <input className="neo-input" style={inputStyle} type="number" min={1} value={form.nombre_postes} onChange={e => set('nombre_postes', e.target.value)} />
          </div>
        </div>
        <div>
          {label('Description des tâches', true)}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Maximum 1000 caractères — une tâche par ligne</div>
          <textarea
            className="neo-input"
            style={{ minHeight: 130, fontSize: 13, resize: 'vertical', lineHeight: 1.6 }}
            placeholder={`Lire et interpréter les instructions techniques\nDéterminer la technique de soudure appropriée\nContrôler la qualité de la soudure\nObserver les prescriptions de sécurité`}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            maxLength={1000}
          />
          <div style={{ fontSize: 10, color: form.description.length > 900 ? '#EF4444' : 'var(--muted)', textAlign: 'right', marginTop: 2 }}>
            {form.description.length}/1000
          </div>
        </div>
      </div>

      {/* ── LE PROFIL RECHERCHÉ ──────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16 }}>
          👤 LE PROFIL RECHERCHÉ
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            {label('Qualification')}
            <select className="neo-input" style={inputStyle} value={form.qualification} onChange={e => set('qualification', e.target.value)}>
              {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            {label('Formation / Diplômes exigés')}
            <input className="neo-input" style={inputStyle} placeholder="ex: CAP Soudure, BEP…" value={form.formation} onChange={e => set('formation', e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {label('Connaissances particulières (langues, permis, informatique…)')}
          <input className="neo-input" style={inputStyle} placeholder="ex: Français courant, Permis B, Lecture de plans" value={form.connaissances} onChange={e => set('connaissances', e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          {label('Expérience professionnelle (domaines et durée)')}
          <input className="neo-input" style={inputStyle} placeholder="ex: Soudure industrielle, chaudronnerie" value={form.experience} onChange={e => set('experience', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.debutant} onChange={e => set('debutant', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            Débutant accepté
          </label>
          {!form.debutant && (<>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="exp_type" checked={form.exp_type === 'exigee'} onChange={() => set('exp_type', 'exigee')} style={{ accentColor: 'var(--primary)' }} />
              Expérience exigée
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="exp_type" checked={form.exp_type === 'souhaitee'} onChange={() => set('exp_type', 'souhaitee')} style={{ accentColor: 'var(--primary)' }} />
              Souhaitée
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="neo-input" style={{ height: 30, width: 70, fontSize: 13 }} type="text" placeholder="5-10" value={form.exp_annees} onChange={e => set('exp_annees', e.target.value)} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>année(s)</span>
            </div>
          </>)}
        </div>
      </div>

      {/* ── LES CONDITIONS D'EMPLOI ──────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16 }}>
          📋 LES CONDITIONS D'EMPLOI
        </h3>
        {/* Contrat */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <input type="radio" name="contrat" checked={form.contrat === 'cdi'} onChange={() => set('contrat', 'cdi')} style={{ accentColor: 'var(--primary)' }} />
            CDI
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <input type="radio" name="contrat" checked={form.contrat === 'cdd'} onChange={() => set('contrat', 'cdd')} style={{ accentColor: 'var(--primary)' }} />
            CDD
          </label>
          {form.contrat === 'cdd' && (
            <input className="neo-input" style={{ height: 30, fontSize: 13, width: 200 }} placeholder="Durée (ex: Poste à l'année)" value={form.duree_cdd} onChange={e => set('duree_cdd', e.target.value)} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            {label('Horaire de travail (Début – Fin)')}
            <input className="neo-input" style={inputStyle} placeholder="ex: 6h30 – 17h30" value={form.horaire} onChange={e => set('horaire', e.target.value)} />
          </div>
          <div>
            {label('Heures hebdomadaires')}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="neo-input" style={{ ...inputStyle, flex: 1 }} type="text" placeholder="40" value={form.heures_hebdo} onChange={e => set('heures_hebdo', e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={form.temps_partiel} onChange={e => set('temps_partiel', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                Temps partiel
              </label>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {label('Précisions horaires (3×8, week-end, nuit…)')}
          <input className="neo-input" style={inputStyle} placeholder="ex: Horaires journaliers, pas de travail de nuit" value={form.precision_horaires} onChange={e => set('precision_horaires', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, marginBottom: 12 }}>
          <div>
            {label('Lieu de travail', true)}
            <input className="neo-input" style={inputStyle} placeholder="ex: Valais – Vaud" value={form.lieu} onChange={e => set('lieu', e.target.value)} />
          </div>
          <div>
            {label('Salaire de (CHF)')}
            <input className="neo-input" style={{ ...inputStyle, width: 100 }} type="text" placeholder="4000" value={form.salaire_de} onChange={e => set('salaire_de', e.target.value)} />
          </div>
          <div>
            {label('à (CHF)')}
            <input className="neo-input" style={{ ...inputStyle, width: 100 }} type="text" placeholder="5500" value={form.salaire_a} onChange={e => set('salaire_a', e.target.value)} />
          </div>
        </div>
        <div>
          {label('Prise de poste')}
          <input className="neo-input" style={{ ...inputStyle, width: 200 }} type="date" value={form.prise_de_poste} onChange={e => set('prise_de_poste', e.target.value)} />
        </div>
      </div>

      {/* ── SERVICE ATTENDU ─────────────────────────────────────────────── */}
      <div className="neo-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16 }}>
          📬 SERVICE ATTENDU
        </h3>
        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" name="contact" checked={form.contact_direct} onChange={() => set('contact_direct', true)} style={{ accentColor: 'var(--primary)' }} />
            Les candidats nous contactent directement
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" name="contact" checked={!form.contact_direct} onChange={() => set('contact_direct', false)} style={{ accentColor: 'var(--primary)' }} />
            Les candidats répondent à France Travail
          </label>
        </div>
        {form.contact_direct && (
          <div style={{ marginBottom: 12 }}>
            {label('Coordonnées de contact')}
            <input className="neo-input" style={inputStyle} value={form.contact_info} onChange={e => set('contact_info', e.target.value)} />
          </div>
        )}
        <div>
          {label('Infos complémentaires (nom du client final, secteur…)')}
          <input className="neo-input" style={inputStyle} placeholder="ex: Client : Société ABC — Secteur : Industrie métallurgique" value={form.infos_complementaires} onChange={e => set('infos_complementaires', e.target.value)} />
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: '#FEE2E2', border: '1.5px solid #FECACA', marginBottom: 16 }}>
          <AlertCircle size={14} color="#DC2626" />
          <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
        </div>
      )}

      {/* Bouton envoi */}
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
