// TalentFlow Rapports — Bouton fixe "Contacter L-Agence" + modal bottom sheet
// v2.4.0 — Phase 1 mobile-first
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { MessageCircle, Phone, X as XIcon, Building2 } from 'lucide-react'
import { LAGENCE_CONTACT, waMeUrl, telUrl } from '@/lib/lagence-contact'

export default function ContactAgenceButton() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Contacter L-Agence"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 90,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 18px',
          background: '#EAB308',
          color: '#1C1A14',
          border: 'none',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(28,26,20,0.18)',
        }}
      >
        <Building2 size={16} />
        Contacter L-Agence
      </button>

      {mounted && open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '20px 22px 28px',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
              animation: 'slideUp 0.24s ease-out',
            }}
          >
            <style jsx>{`
              @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
            `}</style>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 999, background: '#E5E7EB' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <Image
                  src="/logo-agence.png"
                  alt="L-Agence"
                  width={96}
                  height={32}
                  style={{ height: 32, width: 'auto', objectFit: 'contain' }}
                />
                <h2 style={{
                  fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
                  fontSize: 22,
                  fontWeight: 400,
                  color: '#1C1A14',
                  margin: '12px 0 4px',
                  letterSpacing: '-0.01em',
                }}>
                  Contacter {LAGENCE_CONTACT.raisonSociale}
                </h2>
                <p style={{ fontSize: 13.5, color: '#6B7280', margin: 0 }}>
                  Une question ? On est là.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6B7280',
                }}
              >
                <XIcon size={16} />
              </button>
            </div>

            <a
              href={waMeUrl(LAGENCE_CONTACT.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: '#25D366',
                color: '#fff',
                borderRadius: 14,
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              <MessageCircle size={20} />
              <div style={{ flex: 1 }}>
                <div>WhatsApp</div>
                <div style={{ fontSize: 12, opacity: 0.92, fontWeight: 400 }}>{LAGENCE_CONTACT.whatsapp}</div>
              </div>
            </a>

            <a
              href={telUrl(LAGENCE_CONTACT.bureau)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: '#1C1A14',
                color: '#fff',
                borderRadius: 14,
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              <Phone size={20} />
              <div style={{ flex: 1 }}>
                <div>Appeler le bureau</div>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 400 }}>{LAGENCE_CONTACT.bureau}</div>
              </div>
            </a>

            <p style={{
              fontSize: 12.5,
              color: '#6B7280',
              textAlign: 'center',
              margin: '4px 0 0',
            }}>
              {LAGENCE_CONTACT.horaires}
            </p>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
