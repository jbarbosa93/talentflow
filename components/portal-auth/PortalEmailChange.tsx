'use client'

// TalentFlow Sign — Changer son e-mail (portail candidat). v2.10.44
// Flux en 2 étapes avec vérification : saisie du nouvel email → code reçu dessus
// → confirmation → l'email de connexion est mis à jour.

import { useState } from 'react'
import { Mail, Loader2, CheckCircle2, ChevronRight } from 'lucide-react'

export default function PortalEmailChange({ currentEmail }: { currentEmail: string }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function requestCode() {
    setErr(null); setBusy(true)
    try {
      const r = await fetch('/api/portal/change-email/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await r.json()
      if (d.ok) { setSentTo(d.email); setStep('code') }
      else setErr(d.error || 'Erreur')
    } catch { setErr('Erreur réseau') } finally { setBusy(false) }
  }

  async function confirm() {
    setErr(null); setBusy(true)
    try {
      const r = await fetch('/api/portal/change-email/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const d = await r.json()
      if (d.ok) setStep('done')
      else setErr(d.error || 'Code incorrect')
    } catch { setErr('Erreur réseau') } finally { setBusy(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 16, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }
  const btnStyle: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#EAB308', color: '#1C1A14', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }

  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>Mon adresse e-mail</h2>

      {!open ? (
        <button onClick={() => { setOpen(true); setStep('email'); setErr(null); setEmail('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '13px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Mail size={17} color="#6B7280" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: '#1C1A14', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentEmail}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Changer mon e-mail</div>
          </div>
          <ChevronRight size={17} color="#C9C3B5" />
        </button>
      ) : (
        <div style={{ padding: '14px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#FAFAF7' }}>
          {step === 'email' && (
            <>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 10px', lineHeight: 1.5 }}>
                Saisis ta nouvelle adresse. Un code de confirmation y sera envoyé.
              </p>
              <input type="email" inputMode="email" autoCapitalize="off" placeholder="nouvel.email@exemple.com"
                value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
              {err && <div style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10 }}>{err}</div>}
              <button onClick={requestCode} disabled={busy || !email} style={btnStyle}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Envoyer le code
              </button>
              <button onClick={() => setOpen(false)} style={{ width: '100%', marginTop: 8, padding: 8, background: 'transparent', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
            </>
          )}

          {step === 'code' && (
            <>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 10px', lineHeight: 1.5 }}>
                Un code à 6 chiffres a été envoyé à <strong style={{ color: '#1C1A14' }}>{sentTo}</strong>. Saisis-le ci-dessous.
              </p>
              <input inputMode="numeric" maxLength={6} placeholder="123456"
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: 700 }} />
              {err && <div style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10 }}>{err}</div>}
              <button onClick={confirm} disabled={busy || code.length !== 6} style={btnStyle}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirmer
              </button>
              <button onClick={() => setStep('email')} style={{ width: '100%', marginTop: 8, padding: 8, background: 'transparent', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>← Changer d&apos;adresse</button>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14', marginBottom: 6 }}>E-mail mis à jour !</div>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 14px', lineHeight: 1.5 }}>
                Tu te connecteras désormais avec <strong style={{ color: '#1C1A14' }}>{sentTo}</strong>.
              </p>
              <button onClick={() => { setOpen(false); setStep('email') }} style={btnStyle}>OK</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
