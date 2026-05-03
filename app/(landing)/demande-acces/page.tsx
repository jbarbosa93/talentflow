'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2, ArrowLeft, Sparkles, X } from 'lucide-react'

export default function DemandeAccesPage() {
  const router = useRouter()
  const [form, setForm] = useState({ prenom: '', nom: '', entreprise: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.prenom || !form.nom || !form.entreprise || !form.email) {
      setError('Merci de remplir tous les champs.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/demande-acces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur serveur')
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FFFDF5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* v1.9.135 — Décor éclair jaune doux en background */}
      <div aria-hidden style={{
        position: 'absolute', top: '-15%', right: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, #EAB308 0%, transparent 60%)',
        opacity: 0.12, pointerEvents: 'none', zIndex: 0,
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: '-20%', left: '-10%',
        width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, #F5A623 0%, transparent 65%)',
        opacity: 0.08, pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Bouton fermer */}
      <button
        onClick={() => router.back()}
        style={{
          position: 'fixed', top: 24, right: 24,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(28,26,20,0.10)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 14px rgba(28,26,20,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#1C1A14',
          transition: 'all 0.15s',
          zIndex: 10,
        }}
        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = '#EAB308' }}
        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.85)' }}
        title="Retour"
      >
        <X size={16} strokeWidth={2.5} />
      </button>

      {/* Logo */}
      <Link href="/" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        textDecoration: 'none', marginBottom: 40,
        position: 'relative', zIndex: 1,
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9,
          background: '#EAB308',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 6px 18px -4px rgba(234,179,8,.45)',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L4 13h7l-1 9 10-12h-7z" fill="#1C1A14"/>
          </svg>
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1C1A14', letterSpacing: '-0.01em' }}>
          TalentFlow
        </span>
      </Link>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 460,
        background: 'rgba(255, 255, 255, 0.85)',
        border: '1px solid rgba(28, 26, 20, 0.08)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 30px 80px -20px rgba(28, 26, 20, 0.15), 0 0 0 1px rgba(234, 179, 8, 0.04) inset',
        padding: '36px 32px',
        position: 'relative', zIndex: 1,
      }}>

        {done ? (
          /* ── Succès ── */
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle size={28} color="#15803D" strokeWidth={2} />
            </div>
            <h2 style={{
              fontSize: 26, fontWeight: 400, color: '#1C1A14',
              marginBottom: 12, letterSpacing: '-0.01em',
              fontFamily: 'var(--font-instrument-serif, "Instrument Serif", Georgia, serif)',
            }}>
              Demande envoyée !
            </h2>
            <p style={{ fontSize: 14, color: '#5C5645', lineHeight: 1.6, marginBottom: 28 }}>
              Merci <strong style={{ color: '#1C1A14' }}>{form.prenom}</strong> ! Votre demande d&apos;accès a bien été reçue.
              Nous reviendrons vers vous à <strong style={{ color: '#1C1A14' }}>{form.email}</strong> très prochainement.
            </p>
            <Link href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 600, color: '#B45309',
              textDecoration: 'none',
            }}>
              <ArrowLeft size={14} /> Retour à l&apos;accueil
            </Link>
          </div>
        ) : (
          /* ── Formulaire ── */
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.30)',
                borderRadius: 100, padding: '4px 11px', marginBottom: 18,
              }}>
                <Sparkles size={12} color="#B45309" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#B45309', letterSpacing: '0.02em' }}>
                  Accès sur invitation
                </span>
              </div>
              <h1 style={{
                fontSize: 30, fontWeight: 400, color: '#1C1A14',
                letterSpacing: '-0.015em', margin: '0 0 8px',
                fontFamily: 'var(--font-instrument-serif, "Instrument Serif", Georgia, serif)',
                lineHeight: 1.1,
              }}>
                Demandez votre accès
              </h1>
              <p style={{ fontSize: 13.5, color: '#5C5645', lineHeight: 1.55, margin: 0 }}>
                TalentFlow est actuellement en accès anticipé. Remplissez ce formulaire
                et nous vous contacterons sous 24h.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={daLabel}>Prénom *</label>
                  <input name="prenom" value={form.prenom} onChange={handleChange} placeholder="Sophie" style={daInput} />
                </div>
                <div>
                  <label style={daLabel}>Nom *</label>
                  <input name="nom" value={form.nom} onChange={handleChange} placeholder="Martin" style={daInput} />
                </div>
              </div>

              <div>
                <label style={daLabel}>Entreprise *</label>
                <input name="entreprise" value={form.entreprise} onChange={handleChange} placeholder="Acme Recrutement" style={daInput} />
              </div>

              <div>
                <label style={daLabel}>Adresse email *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="sophie@entreprise.com" style={daInput} />
              </div>

              {error && (
                <p style={{
                  fontSize: 12.5, color: '#B91C1C', fontWeight: 500, margin: 0,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)',
                  padding: '9px 12px', borderRadius: 8,
                }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  width: '100%', height: 44,
                  background: loading ? '#e5e0d6' : '#EAB308',
                  border: '1px solid ' + (loading ? '#e5e0d6' : '#EAB308'),
                  borderRadius: 10,
                  boxShadow: loading ? 'none' : '0 8px 24px -8px rgba(234,179,8,0.50)',
                  fontSize: 14, fontWeight: 700, color: '#1C1A14',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseOver={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#F5A623' }}
                onMouseOut={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#EAB308' }}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Envoi en cours…
                  </>
                ) : (
                  'Envoyer ma demande →'
                )}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 18 }}>
              Déjà un accès ?{' '}
              <Link href="/login" style={{ color: '#B45309', fontWeight: 600, textDecoration: 'none' }}>
                Se connecter
              </Link>
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        input:focus { border-color: #EAB308 !important; box-shadow: 0 0 0 3px rgba(234,179,8,0.20) !important; }
      `}</style>
    </div>
  )
}

const daLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#5C5645',
  display: 'block', marginBottom: 6, letterSpacing: '-0.005em',
}

const daInput: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  border: '1px solid #e5e0d6', borderRadius: 10,
  fontSize: 13.5, fontWeight: 500, color: '#1C1A14',
  background: '#fff', outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.12s, box-shadow 0.12s',
}
