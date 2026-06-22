import { describe, it, expect } from 'vitest'
import { isGenericCvFilename } from '@/lib/cv-filename'

// Règle métier absolue : un nom de fichier générique ne doit JAMAIS servir de clé
// de matching. isGenericCvFilename garde le pré-check d'idempotence cv/parse.
describe('isGenericCvFilename — anti faux-match par nom de fichier', () => {
  it('marque GÉNÉRIQUE les noms partagés (cause du bug José Batista → Duarte Barbacena)', () => {
    expect(isGenericCvFilename('CV 2025.pdf')).toBe(true)
    expect(isGenericCvFilename('CV_2025.pdf')).toBe(true)
    expect(isGenericCvFilename('1782113924011_CV_2025.pdf')).toBe(true)
    expect(isGenericCvFilename('cv.pdf')).toBe(true)
    expect(isGenericCvFilename('CV.pdf')).toBe(true)
    expect(isGenericCvFilename('document.pdf')).toBe(true)
    expect(isGenericCvFilename('scan.pdf')).toBe(true)
    expect(isGenericCvFilename('Numérisation 2024.pdf')).toBe(true)
    expect(isGenericCvFilename('curriculum vitae.pdf')).toBe(true)
    expect(isGenericCvFilename('sans titre.pdf')).toBe(true)
    expect(isGenericCvFilename('image.jpg')).toBe(true)
    expect(isGenericCvFilename('')).toBe(true)
    expect(isGenericCvFilename(null)).toBe(true)
    expect(isGenericCvFilename(undefined)).toBe(true)
  })

  it('garde DISCRIMINANT les noms contenant un vrai nom de personne', () => {
    expect(isGenericCvFilename('BENCHAAR salim 20.10.2025.pdf')).toBe(false)
    expect(isGenericCvFilename('1776543210_BENCHAAR_salim_20.10.2025.pdf')).toBe(false)
    expect(isGenericCvFilename('CV Jose Batista.pdf')).toBe(false)
    expect(isGenericCvFilename('cv-jose-batista-serrurier.pdf')).toBe(false)
    expect(isGenericCvFilename('Dupont.pdf')).toBe(false)
    expect(isGenericCvFilename('Mendes Teixeira.pdf')).toBe(false)
  })
})
