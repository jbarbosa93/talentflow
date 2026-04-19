'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useMemo } from 'react'

// Affiche un avatar photo rond + une main animée qui fait "👋" à côté.
// Si l'email correspond à João ou Seb, utilise la photo correspondante.
// Sinon, fallback emoji 👋 seul.

interface Props {
  email?: string | null
  size?: number
}

function resolvePhoto(email: string | null | undefined): string | null {
  if (!email) return null
  const e = email.toLowerCase()
  if (e === 'j.barbosa@l-agence.ch' || e === 'jbarbosa93@hotmail.com') return '/avatars/joao.jpg'
  if (e.startsWith('s.') || e.includes('seb')) return '/avatars/seb.jpg'
  return null
}

export default function WavingAvatar({ email, size = 56 }: Props) {
  const photo = useMemo(() => resolvePhoto(email), [email])

  if (!photo) {
    return (
      <motion.span
        style={{ fontSize: size * 0.7, display: 'inline-block', transformOrigin: '70% 70%' }}
        animate={{ rotate: [0, 18, -12, 18, -6, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
        aria-hidden
      >
        👋
      </motion.span>
    )
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={{
          width: size, height: size, borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid var(--primary)',
          boxShadow: '0 4px 14px rgba(245,167,35,0.25)',
          background: 'var(--muted)',
        }}
      >
        <Image
          src={photo}
          alt=""
          width={size}
          height={size}
          unoptimized
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
        />
      </motion.div>
      {/* Main qui salue, ancrée en bas-droite */}
      <motion.span
        style={{
          position: 'absolute', bottom: -4, right: -6,
          fontSize: size * 0.42, lineHeight: 1,
          transformOrigin: '70% 70%',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))',
        }}
        animate={{ rotate: [0, 20, -10, 20, -4, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
        aria-hidden
      >
        👋
      </motion.span>
    </div>
  )
}
