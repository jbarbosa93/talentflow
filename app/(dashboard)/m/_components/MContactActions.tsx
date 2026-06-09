'use client'
// Boutons d'action contact (Appeler / WhatsApp / Mail) — liste + fiche candidat (v2.10.x app)
import { Phone, Mail, MessageCircle } from 'lucide-react'

// wa.me exige uniquement les chiffres (indicatif pays compris), sans + ni espaces.
function waNumber(phone?: string | null): string {
  if (!phone) return ''
  let digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  // Numéro suisse saisi en 0xx… → préfixer 41 (sans le 0)
  if (digits.startsWith('0')) digits = '41' + digits.slice(1)
  return digits
}

function stop(e: React.MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
}

export default function MContactActions({
  phone,
  email,
  size = 'sm',
}: {
  phone?: string | null
  email?: string | null
  size?: 'sm' | 'lg'
}) {
  const wa = waNumber(phone)
  const dim = size === 'lg' ? 44 : 34
  const icon = size === 'lg' ? 20 : 16
  const btn = (bg: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: dim, height: dim, borderRadius: '50%',
    background: bg, color: '#fff', flexShrink: 0,
  })

  if (!phone && !email) return null

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {phone && (
        <a href={`tel:${phone}`} onClick={stop} style={btn('#3b82f6')} aria-label="Appeler">
          <Phone size={icon} />
        </a>
      )}
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          style={btn('#25D366')}
          aria-label="WhatsApp"
        >
          <MessageCircle size={icon} />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} onClick={stop} style={btn('#6b7280')} aria-label="Email">
          <Mail size={icon} />
        </a>
      )}
    </div>
  )
}
