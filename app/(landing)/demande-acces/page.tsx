'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle, Loader2, ArrowLeft, Sparkles } from 'lucide-react'

export default function DemandeAccesPage() {
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
      fontFamily: 'var(--font-body, sans-serif)',
    }}>

      {/* Logo */}
      <Link href="/" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        textDecoration: 'none', marginBottom: 48,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: '#F7C948', border: '2px solid #1C1A14',
          boxShadow: '2px 2px 0 #1C1A14',
        }} />
        <span style={{ fontSize: 20, fontWeight: 900, color: '#1C1A14', letterSpacing: '-0.5px' }}>
          TalentFlow
        </span>
      </Link>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'white',
        border: '2.5px solid #1C1A14',
        borderRadius: 16,
        boxShadow: '6px 6px 0 #1C1A14',
        padding: '40px 36px',
      }}>

        {done ? (
          /* ── Succès ── */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#D1FAE5', border: '2px solid #059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle size={30} color="#059669" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1C1A14', marginBottom: 12, letterSpacing: '-0.5px' }}>
              Demande envoyée !
            </h2>
            <p style={{ fontSize: 15, color: '#6B6B5B', lineHeight: 1.6, marginBottom: 28 }}>
              Merci <strong>{form.prenom}</strong> ! Votre demande d&apos;accès a bien été reçue.
              Nous reviendrons vers vous à <strong>{form.email}</strong> très prochainement.
            </p>
            <Link href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 700, color: '#1C1A14',
              textDecoration: 'none',
            }}>
              <ArrowLeft size={14} /> Retour à l&apos;accueil
            </Link>
          </div>
        ) : (
          /* ── Formulaire ── */
          <>
            <div style={{ marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#FFF3C4', border: '1.5px solid #F7C948',
                borderRadius: 100, padding: '4px 12px', marginBottom: 16,
              }}>
                <Sparkles size={12} color="#7A5F00" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7A5F00' }}>Accès sur invitation</span>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#1C1A14', letterSpacing: '-0.5px', marginBottom: 8 }}>
                Demandez votre accès
              </h1>
              <p style={{ fontSize: 14, color: '#6B6B5B', lineHeight: 1.6 }}>
                TalentFlow est actuellement en accès anticipé. Remplissez ce formulaire
                et nous vous contacterons sous 24h.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Prénom */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1A14', display: 'block', marginBottom: 6 }}>
                    Prénom *
                  </label>
                  <input
                    name="prenom"
                    value={form.prenom}
                    onChange={handleChange}
                    placeholder="Sophie"
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '2px solid #1C1A14', borderRadius: 8,
                      fontSize: 14, fontWeight: 500, color: '#1C1A14',
                      background: 'white', outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                {/* Nom */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1A14', display: 'block', marginBottom: 6 }}>
                    Nom *
                  </label>
                  <input
                    name="nom"
                    value={form.nom}
                    onChange={handleChange}
                    placeholder="Martin"
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '2px solid #1C1A14', borderRadius: 8,
                      fontSize: 14, fontWeight: 500, color: '#1C1A14',
                      background: 'white', outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* Entreprise */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1A14', display: 'block', marginBottom: 6 }}>
                  Entreprise *
                </label>
                <input
                  name="entreprise"
                  value={form.entreprise}
                  onChange={handleChange}
                  placeholder="Acme Recrutement"
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '2px solid #1C1A14', borderRadius: 8,
                    fontSize: 14, fontWeight: 500, color: '#1C1A14',
                    background: 'white', outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1A14', display: 'block', marginBottom: 6 }}>
                  Adresse email *
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="sophie@entreprise.com"
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '2px solid #1C1A14', borderRadius: 8,
                    fontSize: 14, fontWeight: 500, color: '#1C1A14',
                    background: 'white', outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Erreur */}
              {error && (
                <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, margin: 0 }}>
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 8,
                  width: '100%', padding: '13px 0',
                  background: loading ? '#ccc' : '#F7C948',
                  border: '2.5px solid #1C1A14',
                  borderRadius: 10,
                  boxShadow: loading ? 'none' : '4px 4px 0 #1C1A14',
                  fontSize: 15, fontWeight: 900, color: '#1C1A14',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Envoi en cours...
                  </>
                ) : (
                  'Envoyer ma demande →'
                )}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#9E9E8E', marginTop: 20 }}>
              Déjà un accès ?{' '}
              <Link href="/login" style={{ color: '#1C1A14', fontWeight: 700 }}>
                Se connecter
              </Link>
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        input:focus { border-color: #F7C948 !important; box-shadow: 0 0 0 3px rgba(247,201,72,0.2); }
      `}</style>
    </div>
  )
}
