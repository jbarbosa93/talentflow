// TalentFlow Rapports — Logo L-Agence officiel (PNG raster, fond transparent)
// v2.4.4 — Bascule du SVG inline vers le VRAI PNG officiel uploadé dans public/
//
// 2 versions disponibles :
//   - public/logo-agence-officiel.png             (texte NOIR, 550×170) → fond clair
//   - public/logo-agence-officiel-transparent.png (texte BLANC, 250×60) → fond foncé
'use client'

import Image from 'next/image'

interface Props {
  /** Hauteur cible en px. Le ratio est préservé. Défaut 36px. */
  height?: number
  /** 'dark' (par défaut, texte noir pour fond clair) | 'light' (texte blanc pour fond foncé) */
  color?: 'dark' | 'light'
  className?: string
}

export default function LogoLAgence({ height = 36, color = 'dark', className }: Props) {
  // Ratio des fichiers : 550/170 ≈ 3.235 (dark) / 250/60 ≈ 4.166 (light)
  // On utilise un width généreux et `objectFit: contain` laisse Image gérer.
  const src = color === 'light'
    ? '/logo-agence-officiel-transparent.png'
    : '/logo-agence-officiel.png'
  const ratio = color === 'light' ? (250 / 60) : (550 / 170)
  const width = Math.round(height * ratio)
  return (
    <Image
      src={src}
      alt="L-Agence — Emplois fixes & temporaires"
      width={width}
      height={height}
      priority
      className={className}
      style={{ height, width: 'auto', objectFit: 'contain' }}
    />
  )
}
