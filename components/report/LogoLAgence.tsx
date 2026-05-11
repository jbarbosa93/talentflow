// TalentFlow Rapports — Logo L-Agence officiel (PNG vraie transparence)
// v2.5.3 — Bascule vers les 2 PNGs vraiment transparents (canal alpha) :
//   - public/logo-agence-officiel-noir.png   (texte NOIR, 722×147) → fond clair
//   - public/logo-agence-officiel-blanc.png  (texte BLANC, 723×147) → fond foncé
// Plus de hack mix-blend-mode : les PNGs ont un vrai canal alpha.
'use client'

import Image from 'next/image'

interface Props {
  /** Hauteur cible en px. Le ratio est préservé. Défaut 36px. */
  height?: number
  /** 'dark' (défaut, texte noir pour fond clair) | 'light' (texte blanc pour fond foncé) */
  color?: 'dark' | 'light'
  className?: string
}

export default function LogoLAgence({ height = 36, color = 'dark', className }: Props) {
  const src = color === 'light'
    ? '/logo-agence-officiel-blanc.png'
    : '/logo-agence-officiel-noir.png'
  // Ratio commun ~722/147 ≈ 4.91 (les 2 PNGs ont la même dimension)
  const ratio = 722 / 147
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
