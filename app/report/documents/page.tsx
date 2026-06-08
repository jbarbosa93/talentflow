'use client'

// TalentFlow Sign — Mes documents (portail candidat). v2.10.43
// Le candidat voit ses documents (conformité + généraux) et peut en charger.
// Données strictement les siennes (session → candidat_id).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FolderOpen, Eye, Plus, UploadCloud, X, FileText, CheckCircle2, AlertTriangle, Camera } from 'lucide-react'
import PortalLogoHeader from '@/components/report/PortalLogoHeader'

interface Doc { id: string; label: string; type_name: string; status: string | null; expiry_date: string | null; hasRecto: boolean; hasVerso: boolean }
interface DocType { id: string; name: string; requires_expiry: boolean }

const STATUS: Record<string, { txt: string; bg: string; fg: string; icon: any }> = {
  valide: { txt: 'Valide', bg: '#D1FAE5', fg: '#059669', icon: CheckCircle2 },
  expire_bientot: { txt: 'Expire bientôt', bg: '#FEF3C7', fg: '#B45309', icon: AlertTriangle },
  attention: { txt: 'À vérifier', bg: '#FEF3C7', fg: '#B45309', icon: AlertTriangle },
  expire: { txt: 'Expiré', bg: '#FEE2E2', fg: '#DC2626', icon: AlertTriangle },
}
function fmt(d?: string | null) { if (!d) return ''; try { return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return d } }

export default function DocumentsPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<Doc[]>([])
  const [types, setTypes] = useState<DocType[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [typeId, setTypeId] = useState('')
  const [expiry, setExpiry] = useState('')
  const rectoRef = useRef<HTMLInputElement>(null)
  const versoRef = useRef<HTMLInputElement>(null)
  const [rectoName, setRectoName] = useState('')
  const [versoName, setVersoName] = useState('')

  function load() {
    fetch('/api/portal/documents')
      .then(r => { if (r.status === 401) { router.replace('/report/login'); return null } return r.json() })
      .then(d => { if (d) { setDocs(d.documents || []); setTypes(d.types || []) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selType = types.find(t => t.id === typeId)

  async function submit() {
    setErr(null)
    if (!typeId) { setErr('Choisis un type de document.'); return }
    if (!rectoRef.current?.files?.[0]) { setErr('Ajoute un fichier.'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('document_type_id', typeId)
      if (expiry) fd.append('expiry_date', expiry)
      fd.append('recto', rectoRef.current.files[0])
      if (versoRef.current?.files?.[0]) fd.append('verso', versoRef.current.files[0])
      const r = await fetch('/api/portal/documents', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok) { setShowUpload(false); setTypeId(''); setExpiry(''); setRectoName(''); setVersoName(''); setLoading(true); load() }
      else setErr(d.error || 'Échec de l\'envoi')
    } catch { setErr('Erreur réseau') } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px 90px' }}>
      <PortalLogoHeader />
      <div className="tf-fadeup" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 18px' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 400, color: '#1C1A14', margin: 0 }}>Mes documents</h1>
        <button onClick={() => { setShowUpload(true); setErr(null); setRectoName(''); setVersoName('') }} className="tf-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, border: 'none', background: '#EAB308', color: '#1C1A14', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: '#9A958A' }}><Loader2 className="animate-spin" /></div>
      ) : docs.length === 0 ? (
        <div className="tf-fadeup tf-pop" style={{ background: '#fff', border: '1px solid #ECEAE3', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
          <FolderOpen size={32} color="#D6D1C4" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14', marginBottom: 6 }}>Aucun document</div>
          <p style={{ fontSize: 13.5, color: '#9A958A', lineHeight: 1.6, margin: 0 }}>Ajoute ton permis, ta carte d&apos;identité, etc. avec le bouton « Ajouter ».</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {docs.map((doc, i) => {
            const s = doc.status ? STATUS[doc.status] : null
            return (
              <div key={doc.id} className="tf-fadeup" style={{ background: '#fff', border: '1px solid #ECEAE3', borderRadius: 14, padding: '14px 16px', animationDelay: `${i * 0.04}s` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7' }}>
                    <FileText size={19} color="#6B6457" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>{doc.label || doc.type_name}</div>
                    {doc.expiry_date && <div style={{ fontSize: 12.5, color: '#9A958A', marginTop: 2 }}>Expire le {fmt(doc.expiry_date)}</div>}
                  </div>
                  {s && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: s.bg, color: s.fg, flexShrink: 0 }}>
                      <s.icon size={12} /> {s.txt}
                    </span>
                  )}
                </div>
                {(doc.hasRecto || doc.hasVerso) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {doc.hasRecto && <a href={`/api/portal/documents/${doc.id}/file?side=recto`} target="_blank" rel="noreferrer" className="tf-press" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 9, border: '1px solid #ECEAE3', background: '#FAFAF7', color: '#1C1A14', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}><Eye size={15} /> {doc.hasVerso ? 'Recto' : 'Voir'}</a>}
                    {doc.hasVerso && <a href={`/api/portal/documents/${doc.id}/file?side=verso`} target="_blank" rel="noreferrer" className="tf-press" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 9, border: '1px solid #ECEAE3', background: '#FAFAF7', color: '#1C1A14', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}><Eye size={15} /> Verso</a>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal upload */}
      {showUpload && (
        <div onClick={() => !busy && setShowUpload(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: '18px 18px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom,0px))', animation: 'tfFadeUp .3s ease both', maxHeight: 'calc(100dvh - env(safe-area-inset-top,0px) - 10px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1C1A14', margin: 0 }}>Ajouter un document</h2>
              <button onClick={() => !busy && setShowUpload(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9A958A' }}><X size={20} /></button>
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#6B6457' }}>Type de document</label>
            <select value={typeId} onChange={e => setTypeId(e.target.value)} style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid #ECEAE3', fontSize: 15, marginTop: 6, marginBottom: 14, fontFamily: 'inherit', background: '#fff' }}>
              <option value="">— Choisir —</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            {selType?.requires_expiry && (
              <>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#6B6457' }}>Date d&apos;expiration</label>
                <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid #ECEAE3', fontSize: 15, marginTop: 6, marginBottom: 14, fontFamily: 'inherit' }} />
              </>
            )}

            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#6B6457' }}>Photo / fichier (recto)</label>
            <input ref={rectoRef} type="file" accept="image/*,application/pdf" onChange={e => setRectoName(e.target.files?.[0]?.name || '')} style={{ display: 'none' }} />
            <button type="button" onClick={() => rectoRef.current?.click()} className="tf-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', marginTop: 6, marginBottom: 14, borderRadius: 12, border: rectoName ? '1.5px solid #16A34A' : '1.5px dashed #D6D2C8', background: rectoName ? '#F0FDF4' : '#FAF9F6', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              {rectoName ? <CheckCircle2 size={20} color="#16A34A" style={{ flexShrink: 0 }} /> : <Camera size={20} color="#9A958A" style={{ flexShrink: 0 }} />}
              <span style={{ fontSize: 14, fontWeight: 600, color: rectoName ? '#166534' : '#6B6457', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rectoName || 'Prendre une photo ou choisir un fichier'}</span>
            </button>

            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#6B6457' }}>Verso (optionnel)</label>
            <input ref={versoRef} type="file" accept="image/*,application/pdf" onChange={e => setVersoName(e.target.files?.[0]?.name || '')} style={{ display: 'none' }} />
            <button type="button" onClick={() => versoRef.current?.click()} className="tf-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', marginTop: 6, marginBottom: 16, borderRadius: 12, border: versoName ? '1.5px solid #16A34A' : '1.5px dashed #D6D2C8', background: versoName ? '#F0FDF4' : '#FAF9F6', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              {versoName ? <CheckCircle2 size={20} color="#16A34A" style={{ flexShrink: 0 }} /> : <Camera size={20} color="#9A958A" style={{ flexShrink: 0 }} />}
              <span style={{ fontSize: 14, fontWeight: 600, color: versoName ? '#166534' : '#6B6457', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{versoName || 'Prendre une photo ou choisir un fichier'}</span>
            </button>

            {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 13, padding: '9px 12px', borderRadius: 9, marginBottom: 12 }}>{err}</div>}

            <button onClick={submit} disabled={busy} className="tf-press" style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#EAB308', color: '#1C1A14', fontSize: 15.5, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={17} />}
              {busy ? 'Envoi…' : 'Envoyer le document'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
