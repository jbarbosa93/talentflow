import { describe, it, expect } from 'vitest'
import { mergeCandidat, type CandidatExisting, type CVAnalyseInput } from '@/lib/merge-candidat'

const existing = (over: Partial<CandidatExisting> = {}): CandidatExisting => ({ ...over })
const analyse = (over: Partial<CVAnalyseInput> = {}): CVAnalyseInput => ({ ...over })

describe('DDN — immuable (règle métier absolue)', () => {
  it('DB a déjà une DDN, nouveau CV en propose une autre → JAMAIS écrasée', () => {
    const { payload, report } = mergeCandidat(
      existing({ date_naissance: '1990-05-12' }),
      analyse({ date_naissance: '1985-01-01' }),
    )
    expect(payload.date_naissance).toBeUndefined()
    expect(report.kept).toContain('date_naissance')
  })

  it('DB vide → DDN remplie depuis le CV', () => {
    const { payload, report } = mergeCandidat(existing({}), analyse({ date_naissance: '1990-05-12' }))
    expect(payload.date_naissance).toBe('1990-05-12')
    expect(report.filledEmpty).toContain('date_naissance')
  })
})

describe('genre — fill-only + normalisation (check constraint DB)', () => {
  it('normalise "Homme"/"M"/"male" → "homme" si DB vide', () => {
    expect(mergeCandidat(existing({}), analyse({ genre: 'Homme' })).payload.genre).toBe('homme')
    expect(mergeCandidat(existing({}), analyse({ genre: 'M' })).payload.genre).toBe('homme')
    expect(mergeCandidat(existing({}), analyse({ genre: 'female' })).payload.genre).toBe('femme')
  })

  it('genre déjà présent en DB → jamais écrasé', () => {
    const { payload } = mergeCandidat(existing({ genre: 'femme' }), analyse({ genre: 'homme' }))
    expect(payload.genre).toBeUndefined()
  })

  it('genre non reconnu → ignoré (pas de valeur invalide pour la contrainte)', () => {
    const { payload } = mergeCandidat(existing({}), analyse({ genre: 'inconnu' }))
    expect(payload.genre).toBeUndefined()
  })
})

describe('coordonnées — écrasées si nouveau CV fournit une valeur différente', () => {
  it('email/téléphone/localisation écrasés si différents', () => {
    const { payload, report } = mergeCandidat(
      existing({ email: 'old@m.ch', telephone: '+41790000000', localisation: 'Monthey' }),
      analyse({ email: 'new@m.ch', telephone: '+41791111111', localisation: 'Sion' }),
    )
    expect(payload.email).toBe('new@m.ch')
    expect(payload.telephone).toBe('+41791111111')
    expect(payload.localisation).toBe('Sion')
    expect(report.replaced).toEqual(expect.arrayContaining(['email', 'telephone', 'localisation']))
  })

  it('valeur identique → rien à mettre à jour (ignored)', () => {
    const { payload, report } = mergeCandidat(
      existing({ email: 'same@m.ch' }),
      analyse({ email: 'same@m.ch' }),
    )
    expect(payload.email).toBeUndefined()
    expect(report.ignored).toContain('email')
  })

  it('CV ne fournit pas de valeur → champ ignoré (pas d’effacement)', () => {
    const { payload } = mergeCandidat(existing({ email: 'keep@m.ch' }), analyse({}))
    expect(payload.email).toBeUndefined()
  })
})

describe('listes — union avec dédup insensible casse/accents', () => {
  it('compétences dédupliquées (accents/casse) et triées', () => {
    const { payload } = mergeCandidat(
      existing({ competences: ['Soudure'] }),
      analyse({ competences: ['soudure', 'Échafaudage', 'CACES'] }),
    )
    // "Soudure"/"soudure" = doublon → 3 uniques
    expect(payload.competences).toHaveLength(3)
    expect(payload.competences).toContain('Soudure')
  })

  it('expériences dédupliquées par (entreprise|poste|periode)', () => {
    const exp = { poste: 'Maçon', entreprise: 'BTP SA', periode: '2020-2022' }
    const { payload } = mergeCandidat(
      existing({ experiences: [exp] }),
      analyse({ experiences: [{ ...exp }, { poste: 'Chef', entreprise: 'BTP SA', periode: '2022-2023' }] }),
    )
    expect(payload.experiences).toHaveLength(2) // 1er = doublon
  })

  it('aucune nouveauté → pas de payload competences', () => {
    const { payload } = mergeCandidat(
      existing({ competences: ['Soudure', 'CACES'] }),
      analyse({ competences: ['soudure'] }),
    )
    expect(payload.competences).toBeUndefined()
  })
})

describe('champs écrasés (état actuel du CV)', () => {
  it('titre_poste et annees_exp écrasés si non vides et différents', () => {
    const { payload, report } = mergeCandidat(
      existing({ titre_poste: 'Manœuvre', annees_exp: 2 }),
      analyse({ titre_poste: 'Chef de chantier', annees_exp: 5 }),
    )
    expect(payload.titre_poste).toBe('Chef de chantier')
    expect(payload.annees_exp).toBe(5)
    expect(report.replaced).toEqual(expect.arrayContaining(['titre_poste', 'annees_exp']))
  })

  it('annees_exp = 0 ou absent → ne pas écraser', () => {
    const { payload } = mergeCandidat(existing({ annees_exp: 5 }), analyse({ annees_exp: 0 }))
    expect(payload.annees_exp).toBeUndefined()
  })
})

describe('champs jamais touchés par l’import', () => {
  it('aucune clé statut_pipeline/rating/tags/notes dans le payload', () => {
    const { payload } = mergeCandidat(
      existing({ titre_poste: 'X' }),
      analyse({ titre_poste: 'Y', competences: ['a'] }),
    )
    const keys = Object.keys(payload)
    for (const forbidden of ['statut_pipeline', 'rating', 'tags', 'notes']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})
