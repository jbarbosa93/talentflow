'use client'

// TalentFlow — Page Notifications (envoi push aux candidats) — C1
// v2.10.22 — Choisir des candidats (qui ont un appareil enregistré) + titre/texte → Envoyer.

import { useEffect, useState, useMemo, useRef } from 'react'
import { Bell, Send, Search, Loader2, CheckCircle2, Smartphone, ImagePlus, X } from 'lucide-react'

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
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [library, setLibrary] = useState<{ path: string; url: string; name: string }[]>([])
  const [inApp, setInApp] = useState(false)
  const [animation, setAnimation] = useState('none')
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadLibrary() {
    try {
      const r = await fetch('/api/push/images')
      const d = await r.json()
      setLibrary(d.images || [])
    } catch { /* noop */ }
  }
  useEffect(() => { loadLibrary() }, [])

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await fetch('/api/push/upload-image', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok && d.url) { setImageUrl(d.url); loadLibrary() }
      else setResult(`⚠️ ${d.error || 'Échec upload image'}`)
    } catch {
      setResult('⚠️ Erreur upload image')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function deleteFromLibrary(path: string, url: string) {
    try {
      await fetch(`/api/push/images?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
      setLibrary(lib => lib.filter(i => i.path !== path))
      if (imageUrl === url) setImageUrl(null)
    } catch { /* noop */ }
  }

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
        body: JSON.stringify({ candidateIds: Array.from(selected), title: title.trim(), body: body.trim(), imageUrl: imageUrl || undefined, inApp, animation: inApp ? animation : undefined }),
      })
      const d = await r.json()
      if (d.ok) {
        const inAppTxt = d.inApp ? ` 📲 ${d.inApp} modal(s) in-app.` : ''
        setResult(`✅ Envoyé à ${d.sent} appareil(s) (${d.candidats} candidat(s)).${d.failed ? ` ${d.failed} échec(s).` : ''}${inAppTxt}`)
        setTitle(''); setBody(''); setSelected(new Set()); setImageUrl(null); setInApp(false); setAnimation('none')
      } else {
        setResult(`⚠️ ${d.error || 'Échec'}`)
      }
    } catch {
      setResult('⚠️ Erreur réseau')
    } finally {
      setSending(false)
    }
  }

  const canSend = title.trim() && body.trim() && selected.size > 0 && !sending && !uploading

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif', maxWidth: 1040, margin: '0 auto' }}>
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Bell size={22} color="var(--primary)" />
            <span>Notifications TalentFlow Sign</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '6px 0 22px' }}>
            Envoyer une notification push aux candidats qui ont installé l&apos;app et accepté les notifications.
          </p>
        </div>
      </div>

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

          {/* Image optionnelle */}
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>IMAGE <span style={{ fontWeight: 500, textTransform: 'none' }}>(optionnel)</span></div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onPickImage} style={{ display: 'none' }} />
          {imageUrl ? (
            <div style={{ position: 'relative', marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
              <button onClick={() => setImageUrl(null)} title="Retirer l'image"
                style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1.5px dashed var(--border)', background: 'var(--background)', color: 'var(--muted-foreground)', fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14, fontFamily: 'inherit' }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              {uploading ? 'Envoi de l’image…' : 'Ajouter une image'}
            </button>
          )}

          {/* Bibliothèque d'images réutilisables */}
          {library.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>BIBLIOTHÈQUE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {library.map(img => {
                  const isSel = imageUrl === img.url
                  return (
                    <div key={img.path} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: isSel ? '2px solid #EAB308' : '1px solid var(--border)', cursor: 'pointer' }}>
                      <img src={img.url} alt="" onClick={() => setImageUrl(isSel ? null : img.url)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {isSel && (
                        <div style={{ position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderRadius: '50%', background: '#EAB308', color: '#1C1A14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle2 size={12} />
                        </div>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); deleteFromLibrary(img.path, img.url) }} title="Supprimer de la bibliothèque"
                        style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <X size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Affichage dans l'app (modal + animation) */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', marginBottom: inApp ? 10 : 14 }}>
            <input type="checkbox" checked={inApp} onChange={e => setInApp(e.target.checked)} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>✨ Afficher aussi dans l’app (modal animé)</span>
          </label>
          {inApp && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>ANIMATION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[
                  { v: 'none', label: 'Aucune', emoji: '⚪' },
                  { v: 'confetti', label: 'Confetti', emoji: '🎉' },
                  { v: 'hearts', label: 'Cœurs', emoji: '❤️' },
                  { v: 'fireworks', label: 'Feux', emoji: '🎆' },
                  { v: 'snow', label: 'Neige', emoji: '❄️' },
                  { v: 'stars', label: 'Étoiles', emoji: '⭐' },
                ].map(a => {
                  const on = animation === a.v
                  return (
                    <button key={a.v} onClick={() => setAnimation(a.v)}
                      style={{ padding: '8px 4px', borderRadius: 9, border: on ? '2px solid #EAB308' : '1px solid var(--border)', background: on ? '#FEFCE8' : 'var(--background)', color: 'var(--foreground)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
                      <span style={{ fontSize: 18 }}>{a.emoji}</span>{a.label}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                Le candidat verra un modal centré (titre + texte + image) avec l’animation à l’ouverture de l’app. Marche même sans appareil push enregistré.
              </p>
            </div>
          )}

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
