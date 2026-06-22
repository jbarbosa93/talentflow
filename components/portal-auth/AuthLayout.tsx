'use client'

// Layout partagé pour les pages auth portail (login + set-password + forgot)
// Logo L-Agence officiel centré, card blanche, mobile-first, palette TalentFlow

import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
  subtitle?: string
}

export default function AuthLayout({ children, title, subtitle }: Props) {
  return (
    <div style={{
      // v2.13.13 — 100dvh (écran réel iOS) + contenu aligné EN HAUT (avant : centré
      // verticalement → grande bande crème vide au-dessus de la carte sur les pages
      // hautes comme « Mon compte »). Centrage vertical retiré.
      minHeight: '100dvh',
      background: '#FAFAF7',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      padding: '32px 16px 24px',
      fontFamily: 'var(--font-jakarta), system-ui, -apple-system, sans-serif',
      color: '#1C1A14',
    }}>
      {/* Logo L-Agence officiel */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://www.talent-flow.ch/logo-agence-officiel-noir.png"
        alt="L-Agence SA"
        style={{ height: 42, width: 'auto', marginBottom: 24 }}
      />

      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 16,
        padding: '32px 28px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
      }}>
        {title && (
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            textAlign: 'center',
            color: '#1C1A14',
          }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p style={{
            margin: '8px 0 24px',
            fontSize: 14,
            lineHeight: 1.5,
            color: '#6B7280',
            textAlign: 'center',
          }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>

      {/* Footer minimal */}
      <p style={{
        marginTop: 24,
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        Av. des Alpes 3, 1870 Monthey<br />
        +41 24 552 18 70 · <a href="mailto:info@l-agence.ch" style={{ color: '#9CA3AF', textDecoration: 'underline' }}>info@l-agence.ch</a>
      </p>
    </div>
  )
}

// Styles partagés pour les inputs/boutons
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  // v2.10.15 — 16px minimum : en dessous, iOS zoome automatiquement sur le champ
  // au focus (gênant dans l'app + sur mobile). 16px supprime ce zoom auto.
  fontSize: 16,
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  background: '#FFFFFF',
  color: '#1C1A14',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
}

export const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 15,
  fontWeight: 600,
  background: '#EAB308',
  color: '#1C1A14',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'opacity 0.15s',
}

export const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6B7280',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'underline',
  fontFamily: 'inherit',
  padding: 0,
}

export const errorStyle: React.CSSProperties = {
  background: '#FEE2E2',
  border: '1px solid #FECACA',
  color: '#991B1B',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 12,
  lineHeight: 1.5,
}

export const successStyle: React.CSSProperties = {
  background: '#DCFCE7',
  border: '1px solid #BBF7D0',
  color: '#166534',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 12,
  lineHeight: 1.5,
}
