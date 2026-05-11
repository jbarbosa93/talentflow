// TalentFlow Rapports — Logo L-Agence inline (SVG transparent, sans rectangle de fond)
// v2.4.2
//
// Reproduit le vrai logo L-Agence (texte sérif + sous-titre "Emplois fixes & temporaires")
// en SVG inline avec fond transparent. Marche sur n'importe quel fond.
// Prop `color` permet d'inverser (foncé sur fond clair / clair sur fond foncé).
'use client'

interface Props {
  /** Hauteur cible en px (largeur calculée par ratio 3:1). Défaut 36px. */
  height?: number
  /** Couleur du texte. 'dark' (par défaut) pour fond clair, 'light' pour fond foncé, ou hex custom. */
  color?: 'dark' | 'light' | string
  /** className optionnel */
  className?: string
}

export default function LogoLAgence({ height = 36, color = 'dark', className }: Props) {
  const fill = color === 'dark'
    ? '#1C1A14'
    : color === 'light'
      ? '#FFFFFF'
      : color
  // ViewBox 600x200 → ratio 3:1
  const width = Math.round(height * 3)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 200"
      width={width}
      height={height}
      className={className}
      aria-label="L-Agence — Emplois fixes & temporaires"
      role="img"
    >
      <text
        x="300"
        y="115"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="90"
        fontWeight="400"
        fill={fill}
        letterSpacing="2"
      >
        <tspan fontSize="110" fontWeight="700">L</tspan>-AGENCE
      </text>
      <text
        x="300"
        y="155"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="22"
        fill={fill}
        letterSpacing="8"
      >
        Emplois fixes &amp; temporaires
      </text>
    </svg>
  )
}
