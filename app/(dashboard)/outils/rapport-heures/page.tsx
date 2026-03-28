'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ClipboardList, FileDown, Loader2, Mail, MessageCircle, X } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type GridData = {
  [rowKey: string]: { [day: string]: string }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

const ROWS: { key: string; label: string; type: 'number' | 'text' }[] = [
  { key: 'heuresNormales', label: 'Heures normales (en centièmes)', type: 'number' },
  { key: 'repas',          label: 'Repas',                          type: 'number' },
  { key: 'heuresSupp',     label: 'Heures supplémentaires',         type: 'number' },
  { key: 'centreCouts',    label: 'Centre de coûts / chantier',     type: 'text'   },
  { key: 'tempsDepl',      label: 'Temps de déplacement',           type: 'number' },
  { key: 'divers',         label: 'Divers',                         type: 'text'   },
]

const NUMERIC_ROWS = ROWS.filter(r => r.type === 'number').map(r => r.key)

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCurrentWeek(): number {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
  return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
}

function getDatesForWeek(weekNum: number, year: number): Date[] {
  const jan1 = new Date(year, 0, 1)
  const dayOfWeek = jan1.getDay() // 0=Sunday
  const daysToFirstMonday = dayOfWeek <= 1 ? 1 - dayOfWeek : 8 - dayOfWeek
  const firstMonday = new Date(jan1)
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday)
  const targetMonday = new Date(firstMonday)
  targetMonday.setDate(firstMonday.getDate() + (weekNum - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(targetMonday)
    d.setDate(targetMonday.getDate() + i)
    return d
  })
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

function calcRowTotal(rowKey: string, grid: GridData): string {
  if (!NUMERIC_ROWS.includes(rowKey)) return ''
  const sum = DAYS.reduce((acc, day) => {
    const val = parseFloat(grid[rowKey]?.[day] || '0')
    return acc + (isNaN(val) ? 0 : val)
  }, 0)
  return sum === 0 ? '' : String(Math.round(sum * 100) / 100)
}

function initGrid(): GridData {
  const grid: GridData = {}
  for (const row of ROWS) {
    grid[row.key] = {}
    for (const day of DAYS) {
      grid[row.key][day] = ''
    }
  }
  return grid
}

// ── WhatsApp Modal ─────────────────────────────────────────────────────────────

function WhatsAppModal({
  onClose,
  onSendDirect,
  onOpenWa,
  sending,
}: {
  onClose: () => void
  onSendDirect: (tel: string) => void
  onOpenWa: () => void
  sending: boolean
}) {
  const [tel, setTel] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="neo-card-soft" style={{ width: '100%', maxWidth: 420, padding: 28, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
          <X size={16} />
        </button>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>
          Envoyer sur WhatsApp
        </h3>

        {/* Option 1 — Direct API with PDF */}
        <div style={{ padding: 16, borderRadius: 10, border: '1.5px solid var(--border)', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            📎 Envoyer le PDF directement
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Le PDF est envoyé automatiquement sur le numéro indiqué.
          </div>
          <input
            type="tel"
            className="neo-input"
            value={tel}
            onChange={e => setTel(e.target.value)}
            placeholder="+41 79 123 45 67"
            style={{ width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
            onKeyDown={e => e.key === 'Enter' && tel && onSendDirect(tel)}
            autoFocus
          />
          <button
            onClick={() => tel && onSendDirect(tel)}
            disabled={!tel || sending}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
              background: tel && !sending ? '#25D366' : 'rgba(37,211,102,0.35)',
              color: 'white', fontWeight: 700, fontSize: 13,
              cursor: tel && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MessageCircle size={14} />}
            Envoyer le PDF
          </button>
        </div>

        {/* Option 2 — Open WhatsApp to choose contact/group */}
        <div style={{ padding: 16, borderRadius: 10, border: '1.5px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            💬 Ouvrir WhatsApp (groupe ou contact)
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Ouvre WhatsApp pour choisir toi-même le destinataire ou un groupe. Le PDF est à joindre manuellement.
          </div>
          <button
            onClick={onOpenWa}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8,
              border: '1.5px solid #25D366', background: 'transparent',
              color: '#25D366', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            Ouvrir WhatsApp →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Email Modal ────────────────────────────────────────────────────────────────

function EmailModal({
  onClose,
  onSend,
  sending,
}: {
  onClose: () => void
  onSend: (email: string) => void
  sending: boolean
}) {
  const [email, setEmail] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="neo-card-soft" style={{
        width: '100%', maxWidth: 400, padding: 28, position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--muted)', padding: 4,
          }}
        >
          <X size={16} />
        </button>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 6px' }}>
          Envoyer par email
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
          Le rapport PDF sera généré et envoyé à l&apos;adresse indiquée.
        </p>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Adresse email
        </label>
        <input
          type="email"
          className="neo-input"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="destinataire@exemple.com"
          style={{ width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
          onKeyDown={e => e.key === 'Enter' && email && onSend(email)}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)',
              background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)',
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => email && onSend(email)}
            disabled={!email || sending}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#F59E0B', color: 'white', fontWeight: 700, fontSize: 13,
              cursor: email && !sending ? 'pointer' : 'not-allowed',
              opacity: !email || sending ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={14} />}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RapportHeuresPage() {
  const currentYear = new Date().getFullYear()

  const [collaborateur, setCollaborateur] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [semaine, setSemaine] = useState<number>(getCurrentWeek())
  const [grid, setGrid] = useState<GridData>(initGrid())

  const [pdfLoading, setPdfLoading] = useState(false)
  const [whatsappLoading, setWhatsappLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const dates = getDatesForWeek(semaine, currentYear)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const updateCell = useCallback((rowKey: string, day: string, value: string) => {
    setGrid(prev => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [day]: value },
    }))
  }, [])

  // Build payload for API
  const buildPayload = () => ({
    collaborateur,
    entreprise,
    semaine,
    annee: currentYear,
    dates: dates.map(d => formatDate(d)),
    gridData: grid,
  })

  // ── Generate PDF ──
  const handleGeneratePdf = async () => {
    setPdfLoading(true)
    try {
      const res = await fetch('/api/rapport-heures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) throw new Error('Erreur lors de la génération du PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport-heures-semaine-${semaine}-${collaborateur || 'collaborateur'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      showToast('PDF téléchargé avec succès', true)
    } catch (e: any) {
      showToast(e.message || 'Erreur PDF', false)
    } finally {
      setPdfLoading(false)
    }
  }

  // ── WhatsApp — direct API send (with PDF) ──
  const handleWhatsAppDirect = async (tel: string) => {
    setWhatsappLoading(true)
    try {
      const res = await fetch('/api/rapport-heures/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: tel.trim(), ...buildPayload() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur envoi WhatsApp')
      }
      showToast(`PDF envoyé sur WhatsApp (${tel})`, true)
      setShowWhatsAppModal(false)
    } catch (e: any) {
      showToast(e.message || 'Erreur WhatsApp', false)
    } finally {
      setWhatsappLoading(false)
    }
  }

  // ── WhatsApp — open wa.me to choose contact/group ──
  const handleWhatsAppOpen = () => {
    const msg = `Rapport de travail — Semaine N°${semaine}${collaborateur ? ` — ${collaborateur}` : ''}${entreprise ? ` — ${entreprise}` : ''}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── Send Email ──
  const handleSendEmail = async (toEmail: string) => {
    setEmailLoading(true)
    try {
      // First generate PDF
      const pdfRes = await fetch('/api/rapport-heures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!pdfRes.ok) throw new Error('Erreur génération PDF')
      const pdfBlob = await pdfRes.blob()
      const arrayBuffer = await pdfBlob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

      const emailRes = await fetch('/api/rapport-heures/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail,
          collaborateur,
          entreprise,
          semaine,
          pdfBase64: base64,
        }),
      })
      if (!emailRes.ok) throw new Error('Erreur envoi email')
      showToast(`Email envoyé à ${toEmail}`, true)
      setShowEmailModal(false)
    } catch (e: any) {
      showToast(e.message || 'Erreur email', false)
    } finally {
      setEmailLoading(false)
    }
  }

  const COLOR = '#F59E0B'
  const COLOR_SOFT = 'rgba(245,158,11,0.12)'

  return (
    <div className="d-page" style={{ maxWidth: 1100, paddingBottom: 60 }}>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/outils"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}
        >
          <ArrowLeft size={14} /> Outils
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: COLOR_SOFT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ClipboardList size={22} style={{ color: COLOR }} />
        </div>
        <div>
          <h1 className="d-page-title" style={{ margin: 0 }}>Rapport d&apos;heures</h1>
          <p className="d-page-sub" style={{ margin: 0 }}>Créez et envoyez les rapports de travail hebdomadaires</p>
        </div>
      </div>

      {/* Info fields */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Collaborateur(trice)
            </label>
            <input
              type="text"
              className="neo-input"
              value={collaborateur}
              onChange={e => setCollaborateur(e.target.value)}
              placeholder="Nom Prénom"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Entreprise
            </label>
            <input
              type="text"
              className="neo-input"
              value={entreprise}
              onChange={e => setEntreprise(e.target.value)}
              placeholder="Nom de l'entreprise"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Semaine N°
            </label>
            <input
              type="number"
              className="neo-input"
              value={semaine}
              onChange={e => setSemaine(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
              min={1}
              max={53}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {/* Week dates preview */}
        <div style={{
          marginTop: 14, padding: '8px 12px', borderRadius: 8,
          background: COLOR_SOFT, border: `1px solid ${COLOR}30`,
          fontSize: 12, color: 'var(--muted)',
        }}>
          Semaine {semaine} · {formatDate(dates[0])} au {formatDate(dates[6])}.{currentYear}
        </div>
      </div>

      {/* Table */}
      <div className="neo-card-soft" style={{ padding: 0, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 12,
          minWidth: 860,
        }}>
          <thead>
            <tr style={{ background: 'rgba(245,158,11,0.08)' }}>
              <th style={thStyle('left', 160)}>Semaine N°{semaine}</th>
              {DAYS.map((day, i) => (
                <th key={day} style={thStyle('center', 80)}>
                  <div style={{ fontWeight: 700 }}>{day}</div>
                  <div style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>{formatDate(dates[i])}</div>
                </th>
              ))}
              <th style={{ ...thStyle('center', 70), color: COLOR, fontWeight: 800 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => {
              const isEven = rowIdx % 2 === 0
              const total = calcRowTotal(row.key, grid)
              return (
                <tr key={row.key} style={{ background: isEven ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  <td style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--border)',
                    fontWeight: 600, color: 'var(--foreground)', fontSize: 12,
                    borderRight: '1px solid var(--border)',
                  }}>
                    {row.label}
                  </td>
                  {DAYS.map(day => (
                    <td key={day} style={{
                      padding: 4, borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)', textAlign: 'center',
                    }}>
                      <input
                        type={row.type}
                        value={grid[row.key]?.[day] ?? ''}
                        onChange={e => updateCell(row.key, day, e.target.value)}
                        placeholder="—"
                        style={{
                          width: '100%', background: 'none', border: 'none', outline: 'none',
                          textAlign: 'center', fontSize: 13, color: 'var(--foreground)',
                          padding: '4px 2px', boxSizing: 'border-box',
                        }}
                      />
                    </td>
                  ))}
                  <td style={{
                    padding: '8px 10px', borderBottom: '1px solid var(--border)',
                    textAlign: 'center', fontWeight: 700,
                    color: total ? COLOR : 'var(--muted)',
                    fontSize: 13,
                  }}>
                    {total || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleGeneratePdf}
          disabled={pdfLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#0F172A', color: 'white',
            fontWeight: 700, fontSize: 14, cursor: pdfLoading ? 'not-allowed' : 'pointer',
            opacity: pdfLoading ? 0.7 : 1,
          }}
        >
          {pdfLoading
            ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            : <FileDown size={16} />
          }
          Générer PDF
        </button>

        <button
          onClick={() => setShowWhatsAppModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#25D366', color: 'white',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          <MessageCircle size={16} />
          Envoyer WhatsApp
        </button>

        <button
          onClick={() => setShowEmailModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: COLOR, color: 'white',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          <Mail size={16} />
          Envoyer par email
        </button>
      </div>

      {/* WhatsApp modal */}
      {showWhatsAppModal && (
        <WhatsAppModal
          onClose={() => setShowWhatsAppModal(false)}
          onSendDirect={handleWhatsAppDirect}
          onOpenWa={handleWhatsAppOpen}
          sending={whatsappLoading}
        />
      )}

      {/* Email modal */}
      {showEmailModal && (
        <EmailModal
          onClose={() => setShowEmailModal(false)}
          onSend={handleSendEmail}
          sending={emailLoading}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '12px 20px', borderRadius: 10,
          background: toast.ok ? '#10B981' : '#EF4444',
          color: 'white', fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Table style helpers ────────────────────────────────────────────────────────

function thStyle(align: 'left' | 'center', width?: number): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontWeight: 700,
    fontSize: 12,
    color: 'var(--foreground)',
    borderBottom: '2px solid var(--border)',
    borderRight: '1px solid var(--border)',
    width: width ? width : undefined,
    whiteSpace: 'nowrap',
  }
}
