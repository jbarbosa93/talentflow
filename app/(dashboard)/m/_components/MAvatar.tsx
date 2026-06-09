'use client'
// Avatar candidat avec fallback initiales si l'image est absente ou cassée (v2.10.x app)
import { useState } from 'react'

export default function MAvatar({
  src,
  initials,
  alt,
  size = 48,
  className = 'm-avatar',
}: {
  src?: string | null
  initials: string
  alt?: string
  size?: number
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImg = src && !errored
  return (
    <div className={className} style={{ width: size, height: size }}>
      {showImg ? (
        <img
          src={src as string}
          alt={alt || initials}
          loading="lazy"
          onError={() => setErrored(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials || '?'
      )}
    </div>
  )
}
