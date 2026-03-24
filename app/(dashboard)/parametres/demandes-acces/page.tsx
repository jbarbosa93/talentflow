'use client'

import { useEffect, useState } from 'react'
import { Users, Mail, Building2, Clock, CheckCircle, XCircle, RefreshCw, Trash2, RotateCcw } from 'lucide-react'

interface Demande {
  id: string
  prenom: string
  nom: string
  entreprise: string
  email: string
  statut: 'en_attente' | 'approuve' | 'refuse' | 'supprime'
  created_at: string
}

const STATUT_CONFIG = {
  en_attente: { label: 'En attente', bg: '#FFF3C4', color: '#7A5F00', border: '#F7C948' },
  approuve:   { label: 'Approuvé',   bg: '#D1FAE5', color: '#065F46', border: '#86EFAC' },
  refuse:     { label: 'Refusé',     bg: '#FEE2E2', color: '#7F1D1D', border: '#FECACA' },
  supprime:   { label: 'Supprimé',   bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' },
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export default function DemandesAccesPage() {
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [corbeillOpen, setCorbeillOpen] = useState(false)

  const fetchDemandes = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/demande-acces')
      const data = await res.json()
      setDemandes(data.demandes || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDemandes() }, [])

  const updateStatut = async (id: string, statut: string) => {
    setUpdating(id)
    try {
      await fetch(`/api/demande-acces/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      })
      await fetchDemandes()
    } finally {
      setUpdating(null)
    }
  }

  // Suppression définitive (vraie)
  const deleteDefinitif = async (id: string) => {
    setUpdating(id)
    try {
      await fetch(`/api/demande-acces/${id}`, { method: 'DELETE' })
      setDemandes(prev => prev.filter(d => d.id !== id))
    } finally {
      setUpdating(null)
    }
  }

  const enAttente = demandes.filter(d => d.statut === 'en_attente')
  const traitees  = demandes.filter(d => d.statut === 'approuve' || d.statut === 'refuse')
  const corbeille = demandes.filter(d => d.statut === 'supprime')

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--foreground)', letterSpacing: '-0.5px', margin: 0 }}>
            Demandes d&apos;accès
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Personnes ayant demandé un accès à TalentFlow depuis la landing page
          </p>
        </div>
        <button onClick={fetchDemandes} className="neo-btn-ghost" style={{ padding: '8px 12px' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Total', value: enAttente.length + traitees.length, icon: <Users size={16} />, color: 'var(--foreground)' },
          { label: 'En attente', value: enAttente.length, icon: <Clock size={16} />, color: '#7A5F00' },
          { label: 'Approuvés', value: demandes.filter(d => d.statut === 'approuve').length, icon: <CheckCircle size={16} />, color: '#059669' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--card)', border: '1.5px solid var(--border)',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ color: s.color }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 14 }}>
          Chargement...
        </div>
      ) : (enAttente.length + traitees.length) === 0 && corbeille.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          border: '2px dashed var(--border)', borderRadius: 16,
        }}>
          <Users size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            Aucune demande pour l&apos;instant
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Les demandes soumises depuis la landing page apparaîtront ici
          </p>
        </div>
      ) : (
        <>
          {/* En attente */}
          {enAttente.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                En attente ({enAttente.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {enAttente.map(d => (
                  <DemandeCard key={d.id} demande={d} updating={updating === d.id}
                    onUpdate={updateStatut}
                    onTrash={id => updateStatut(id, 'supprime')}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Traitées */}
          {traitees.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                Traitées ({traitees.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {traitees.map(d => (
                  <DemandeCard key={d.id} demande={d} updating={updating === d.id}
                    onUpdate={updateStatut}
                    onTrash={id => updateStatut(id, 'supprime')}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Corbeille */}
          {corbeille.length > 0 && (
            <section>
              {/* Header corbeille cliquable */}
              <button
                onClick={() => setCorbeillOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: corbeillOpen ? 12 : 0,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}
              >
                <Trash2 size={13} />
                Corbeille ({corbeille.length})
                <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                  {corbeillOpen ? '▲ masquer' : '▼ voir'}
                </span>
              </button>

              {corbeillOpen && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, marginTop: 4 }}>
                    Ces demandes ont été supprimées. Vous pouvez les restaurer ou les supprimer définitivement.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {corbeille.map(d => (
                      <DemandeCard key={d.id} demande={d} updating={updating === d.id}
                        onUpdate={updateStatut}
                        onDeleteFinal={deleteDefinitif}
                        isCorbeille
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function DemandeCard({ demande, updating, onUpdate, onTrash, onDeleteFinal, isCorbeille }: {
  demande: Demande
  updating: boolean
  onUpdate: (id: string, statut: string) => void
  onTrash?: (id: string) => void
  onDeleteFinal?: (id: string) => void
  isCorbeille?: boolean
}) {
  const cfg = STATUT_CONFIG[demande.statut] ?? STATUT_CONFIG.supprime

  return (
    <div style={{
      background: isCorbeille ? 'var(--secondary)' : 'var(--card)',
      border: `1.5px solid ${isCorbeille ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      opacity: updating ? 0.6 : isCorbeille ? 0.75 : 1,
      transition: 'opacity 0.15s',
    }}>
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: isCorbeille ? '#CBD5E1' : '#F7C948',
        border: `2px solid ${isCorbeille ? '#94A3B8' : 'var(--foreground)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 900, color: isCorbeille ? '#64748B' : 'var(--foreground)',
      }}>
        {demande.prenom[0]}{demande.nom[0]}
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: isCorbeille ? 'var(--muted)' : 'var(--foreground)' }}>
            {demande.prenom} {demande.nom}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
          }}>
            {cfg.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
            <Building2 size={11} /> {demande.entreprise}
          </span>
          <a
            href={`mailto:${demande.email}`}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
          >
            <Mail size={11} /> {demande.email}
          </a>
        </div>
      </div>

      {/* Date */}
      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {formatDate(demande.created_at)}
      </span>

      {/* Actions — EN ATTENTE */}
      {demande.statut === 'en_attente' && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onUpdate(demande.id, 'approuve')} disabled={updating}
            className="neo-btn" style={{ padding: '6px 12px', fontSize: 12, gap: 4 }}>
            <CheckCircle size={12} /> Approuver
          </button>
          <button onClick={() => onUpdate(demande.id, 'refuse')} disabled={updating}
            className="neo-btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: '#DC2626', borderColor: '#FECACA' }}>
            <XCircle size={12} />
          </button>
          {onTrash && (
            <button onClick={() => onTrash(demande.id)} disabled={updating}
              className="neo-btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: '#94A3B8' }} title="Mettre à la corbeille">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

      {/* Actions — TRAITÉES */}
      {(demande.statut === 'approuve' || demande.statut === 'refuse') && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onUpdate(demande.id, 'en_attente')} disabled={updating}
            className="neo-btn-ghost" style={{ padding: '6px 10px', fontSize: 11, gap: 4 }}>
            <RefreshCw size={11} /> Annuler
          </button>
          {onTrash && (
            <button onClick={() => onTrash(demande.id)} disabled={updating}
              className="neo-btn-ghost" style={{ padding: '6px 10px', fontSize: 11, gap: 4, color: '#DC2626', borderColor: '#FECACA' }}>
              <Trash2 size={11} /> Supprimer
            </button>
          )}
        </div>
      )}

      {/* Actions — CORBEILLE */}
      {isCorbeille && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onUpdate(demande.id, 'en_attente')} disabled={updating}
            className="neo-btn-ghost" style={{ padding: '6px 10px', fontSize: 11, gap: 4 }}
            title="Restaurer la demande">
            <RotateCcw size={11} /> Restaurer
          </button>
          {onDeleteFinal && (
            <button onClick={() => onDeleteFinal(demande.id)} disabled={updating}
              className="neo-btn-ghost" style={{ padding: '6px 10px', fontSize: 11, gap: 4, color: '#DC2626', borderColor: '#FECACA' }}
              title="Supprimer définitivement">
              <Trash2 size={11} /> Définitif
            </button>
          )}
        </div>
      )}
    </div>
  )
}
