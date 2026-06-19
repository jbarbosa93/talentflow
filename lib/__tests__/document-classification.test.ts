import { describe, it, expect } from 'vitest'
import { classifyDocument, type ClassificationInput } from '@/lib/document-classification'

// Raccourci : construit un input avec valeurs par défaut neutres.
const input = (over: Partial<ClassificationInput['analyse']> & { texteCV?: string }): ClassificationInput => {
  const { texteCV = '', ...analyse } = over
  return { analyse, texteCV }
}

describe('Règle 1 — IA explicite non-CV (priorité max)', () => {
  it('document_type=certificat → non-CV, même avec des markers de CV', () => {
    const res = classifyDocument(input({
      document_type: 'certificat',
      experiences: [{}, {}, {}],
      competences: ['a', 'b', 'c', 'd'],
    }))
    expect(res.isNotCV).toBe(true)
    expect(res.docType).toBe('certificat')
    expect(res.reason).toBe('ia')
  })

  it('chaque type explicite non-CV est respecté', () => {
    for (const t of ['attestation', 'lettre_motivation', 'contrat', 'diplome', 'bulletin_salaire', 'permis', 'reference', 'formation']) {
      const res = classifyDocument(input({ document_type: t }))
      expect(res.isNotCV, t).toBe(true)
    }
  })
})

describe('Règle 2 — patterns en-tête haute confiance', () => {
  it('"Certificat de travail" en tête → non-CV même si IA dit cv', () => {
    const res = classifyDocument(input({
      document_type: 'cv',
      texteCV: 'Certificat de travail\n\nNous attestons que M. Dupont a travaillé...',
    }))
    expect(res.isNotCV).toBe(true)
    expect(res.docType).toBe('certificat')
    expect(res.reason).toBe('content_pattern')
  })

  it('"Je soussigné" → certificat', () => {
    const res = classifyDocument(input({ document_type: 'cv', texteCV: 'Je soussigné, directeur, certifie...' }))
    expect(res.docType).toBe('certificat')
  })

  it('Arbeitszeugnis (allemand) → certificat', () => {
    const res = classifyDocument(input({ document_type: 'cv', texteCV: 'Arbeitszeugnis für Herrn Müller' }))
    expect(res.docType).toBe('certificat')
  })

  it('"Madame, Monsieur" + texte court → lettre de motivation', () => {
    const res = classifyDocument(input({ document_type: 'cv', texteCV: 'Madame, Monsieur,\nje vous adresse ma candidature.' }))
    expect(res.docType).toBe('lettre_motivation')
  })
})

describe('Règle 3 — CV-markers durcis (vrais CV)', () => {
  it('variante A : exp ≥ 2 + comp ≥ 3 → CV', () => {
    const res = classifyDocument(input({
      document_type: 'cv',
      experiences: [{}, {}],
      competences: ['a', 'b', 'c'],
      texteCV: 'Parcours professionnel détaillé...',
    }))
    expect(res.isNotCV).toBe(false)
    expect(res.docType).toBe('cv')
    expect(res.reason).toBe('cv_markers')
  })

  it('variante B (indépendant) : exp ≥ 1 + comp ≥ 5 + titre → CV', () => {
    const res = classifyDocument(input({
      document_type: 'cv',
      experiences: [{}],
      competences: ['a', 'b', 'c', 'd', 'e'],
      titre_poste: 'Photographe',
    }))
    expect(res.isNotCV).toBe(false)
    expect(res.docType).toBe('cv')
  })

  it('CV-markers priment sur email générique (cas indépendant info@)', () => {
    const res = classifyDocument(input({
      document_type: 'cv',
      email: 'info@niki-pictures.com',
      experiences: [{}, {}],
      competences: ['a', 'b', 'c'],
    }))
    expect(res.isNotCV).toBe(false) // règle 3 avant règle 4
  })
})

describe('Règle 4 — email générique sans markers forts → non-CV', () => {
  it('info@ + peu de markers → certificat', () => {
    const res = classifyDocument(input({ document_type: 'cv', email: 'info@entreprise.ch', experiences: [{}] }))
    expect(res.isNotCV).toBe(true)
    expect(res.reason).toBe('email_generique')
  })

  it('rh@ et secretariat@ aussi génériques', () => {
    expect(classifyDocument(input({ document_type: 'cv', email: 'rh@boite.ch' })).isNotCV).toBe(true)
    expect(classifyDocument(input({ document_type: 'cv', email: 'secretariat@boite.ch' })).isNotCV).toBe(true)
  })
})

describe('Règle 5 — contenu court sans expérience', () => {
  it('"contrat de travail" dans le corps → contrat', () => {
    const res = classifyDocument(input({
      document_type: 'cv',
      texteCV: 'Le présent contrat de travail est conclu entre les parties suivantes.',
    }))
    expect(res.docType).toBe('contrat')
    expect(res.isNotCV).toBe(true)
  })

  it('"bulletin de salaire" → bulletin_salaire', () => {
    const res = classifyDocument(input({ document_type: 'cv', texteCV: 'Bulletin de salaire — mois de janvier' }))
    expect(res.docType).toBe('bulletin_salaire')
  })
})

describe('Règle 6 — nom présent + aucune expérience → diplôme', () => {
  it('nom réel sans exp → diplome', () => {
    const res = classifyDocument(input({ document_type: 'cv', nom: 'Dupont Jean', texteCV: 'x'.repeat(2000) }))
    expect(res.docType).toBe('diplome')
    expect(res.reason).toBe('no_experience')
  })

  it('nom placeholder "Candidat" ne déclenche pas la règle 6', () => {
    const res = classifyDocument(input({ document_type: 'cv', nom: 'Candidat', texteCV: 'x'.repeat(2000) }))
    expect(res.docType).not.toBe('diplome')
  })
})

describe('Règle 7 — fallback', () => {
  it('IA "autre" → non-CV par défaut', () => {
    const res = classifyDocument(input({ document_type: 'autre', texteCV: 'x'.repeat(2000) }))
    expect(res.isNotCV).toBe(true)
    expect(res.reason).toBe('default')
  })

  it('vrai CV (exp+comp) reste CV', () => {
    const res = classifyDocument(input({
      document_type: 'cv',
      experiences: [{}, {}, {}],
      competences: ['a', 'b', 'c', 'd'],
      texteCV: 'CV complet',
    }))
    expect(res.isNotCV).toBe(false)
  })
})

describe('Jamais de classification par filename', () => {
  it('le filename n’est pas un paramètre de classifyDocument', () => {
    // classifyDocument ne reçoit QUE { analyse, texteCV } — aucun champ filename.
    const keys = Object.keys(input({ document_type: 'cv' }))
    expect(keys.sort()).toEqual(['analyse', 'texteCV'])
  })
})
