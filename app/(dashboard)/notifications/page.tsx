'use client'

// TalentFlow — Page Notifications (envoi push aux candidats) — C1
// v2.10.22 — Choisir des candidats (qui ont un appareil enregistré) + titre/texte → Envoyer.

import { useEffect, useState, useMemo } from 'react'
import { Bell, Send, Search, Loader2, CheckCircle2, Smartphone } from 'lucide-react'

interface Recipient {
  candidate_id: string
  name: string
  photo_url: string | null
  devices: number
  platforms: string[]
}

export default function NotificationsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/push/recipients')
      .then(r => r.json())
      .then(d => setRecipients(d.recipients || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? recipients.filter(r => r.name.toLowerCase().includes(q)) : recipients
  }, [recipients, query])

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.candidate_id))
  function toggleAll() {
    const next = new Set(selected)
    if (allSelected) filtered.forEach(r => next.delete(r.candidate_id))
    else filtered.forEach(r => next.add(r.candidate_id))
    setSelected(next)
  }
  function toggle(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  async function send() {
    if (!title.trim() || !body.trim() || selected.size === 0) return
    setSending(true); setResult(null)
    try {
      const r = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: Array.from(selected), title: title.trim(), body: body.trim() }),
      })
      const d = await r.json()
      if (d.ok) {
        setResult(`✅ Envoyé à ${d.sent} appareil(s) (${d.candidats} candidat(s)).${d.failed ? ` ${d.failed} échec(s).` : ''}`)
        setTitle(''); setBody(''); setSelected(new Set())
      } else {
        setResult(`⚠️ ${d.error || 'Échec'}`)
      }
    } catch {
      setResult('⚠️ Erreur réseau')
    } finally {
      setSending(false)
    }
  }

  const canSend = title.trim() && body.trim() && selected.size > 0 && !sending

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Bell size={26} style={{ color: '#EAB308' }} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Notifications</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>
        Envoyer une notification push aux candidats qui ont installé l&apos;app et accepté les notifications.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 20, alignItems: 'start' }}>
        {/* Colonne gauche : destinataires */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un candidat…"
                style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'inherit' }} />
            </div>
            <button onClick={toggleAll} disabled={filtered.length === 0}
              style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {allSelected ? 'Tout désél.' : 'Tout sél.'}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Loader2 size={20} className="animate-spin" /></div>
          ) : recipients.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
              <Smartphone size={28} style={{ marginBottom: 10, opacity: 0.5 }} /><br />
              Aucun candidat n&apos;a encore d&apos;appareil enregistré.<br />
              Les candidats apparaîtront ici dès qu&apos;ils se connectent dans l&apos;app et acceptent les notifications.
            </div>
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              {filtered.map(r => (
                <label key={r.candidate_id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(r.candidate_id)} onChange={() => toggle(r.candidate_id)} />
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--background)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--muted)' }}>
                    {r.photo_url ? <img src={r.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (r.name[0] || '?')}
                  </div>
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--foreground)', fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Smartphone size={12} /> {r.devices}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Colonne droite : composition */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', padding: 16, position: 'sticky', top: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>TITRE</div>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Ex : Rapport à remplir"
            style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'inherit', marginBottom: 12 }} />

          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>MESSAGE</div>
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={180} rows={4} placeholder="Ex : N'oublie pas ton rapport d'heures de la semaine 🗓️"
            style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', marginBottom: 14 }} />

          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--foreground)' }}>{selected.size}</strong> candidat(s) sélectionné(s)
          </div>

          <button onClick={send} disabled={!canSend}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: canSend ? '#EAB308' : 'var(--border)', color: canSend ? '#1C1A14' : 'var(--muted)', fontSize: 14.5, fontWeight: 800, cursor: canSend ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Envoi…' : 'Envoyer la notification'}
          </button>

          {result && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, fontSize: 13, lineHeight: 1.5, background: result.startsWith('✅') ? '#F0FDF4' : '#FEF2F2', color: result.startsWith('✅') ? '#15803D' : '#B91C1C', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {result.startsWith('✅') && <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span>{result}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
