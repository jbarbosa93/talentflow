// types/database.ts
// Compatible avec @supabase/supabase-js v2.99+

export type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'
export type ImportStatus = 'a_traiter' | 'traite' | 'archive'
export type DocumentType = 'certificat' | 'diplome' | 'lettre_motivation' | 'formation' | 'permis' | 'autre'

export type CandidatDocument = {
  name: string
  url: string
  type: DocumentType
  uploaded_at: string
}
export type OffreStatut = 'active' | 'pourvue' | 'archivee'
export type IntegrationType = 'microsoft' | 'google' | 'whatsapp'
export type EntretienType = 'visio' | 'presentiel' | 'telephone'
export type EntretienStatut = 'planifie' | 'confirme' | 'annule' | 'complete'
export type EmailTemplateCategorie = 'invitation_entretien' | 'relance' | 'refus' | 'offre' | 'general'

// ─── Types entités (pour usage dans les composants) ───────────────────────────

export type Candidat = {
  id: string
  nom: string
  prenom: string | null
  email: string | null
  telephone: string | null
  localisation: string | null
  titre_poste: string | null
  annees_exp: number
  competences: string[]
  formation: string | null
  cv_url: string | null
  cv_nom_fichier: string | null
  photo_url: string | null
  resume_ia: string | null
  cv_texte_brut: string | null
  statut_pipeline: PipelineEtape
  tags: string[]
  notes: string | null
  source: string | null
  // Champs enrichis
  langues: string[] | null
  linkedin: string | null
  permis_conduire: boolean | null
  date_naissance: string | null
  experiences: Array<{ poste: string; entreprise: string; periode: string; description: string }> | null
  formations_details: Array<{ diplome: string; etablissement: string; annee: string }> | null
  rating: number | null
  genre: 'homme' | 'femme' | null
  documents: CandidatDocument[]
  import_status: ImportStatus
  created_at: string
  updated_at: string
}

export type Offre = {
  id: string
  titre: string
  departement: string | null
  description: string | null
  competences: string[]
  exp_requise: number
  localisation: string | null
  type_contrat: string
  salaire_min: number | null
  salaire_max: number | null
  statut: OffreStatut
  notes: string | null
  date_limite: string | null
  // Champs Commandes (client)
  client_nom: string | null
  nb_postes: number
  date_debut: string | null
  duree_mission: string | null
  created_at: string
  updated_at: string
}

export type Pipeline = {
  id: string
  candidat_id: string
  offre_id: string
  etape: PipelineEtape
  score_ia: number | null
  score_detail: Record<string, number> | null
  notes: string | null
  date_entretien: string | null
  salaire_propose: number | null
  created_at: string
  updated_at: string
}

export type NoteCandidat = {
  id: string
  candidat_id: string
  offre_id: string | null
  auteur: string
  contenu: string
  created_at: string
}

export type HistoriquePipeline = {
  id: string
  pipeline_id: string
  candidat_id: string
  offre_id: string
  etape_avant: PipelineEtape | null
  etape_apres: PipelineEtape
  auteur: string | null
  created_at: string
}

export type Integration = {
  id: string
  type: IntegrationType
  email: string | null
  nom_compte: string | null
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  actif: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type Entretien = {
  id: string
  candidat_id: string | null
  offre_id: string | null
  titre: string
  date_heure: string
  duree_minutes: number
  type: EntretienType
  lien_visio: string | null
  lieu: string | null
  notes: string | null
  statut: EntretienStatut
  intervieweur: string | null
  created_at: string
  updated_at: string
}

export type EmailTemplate = {
  id: string
  nom: string
  sujet: string
  corps: string
  categorie: EmailTemplateCategorie
  created_at: string
  updated_at: string
}

export type EmailEnvoye = {
  id: string
  candidat_id: string | null
  integration_id: string | null
  sujet: string
  corps: string
  destinataire: string
  statut: 'envoye' | 'erreur'
  microsoft_message_id: string | null
  created_at: string
}

export type EmailRecu = {
  id: string
  integration_id: string | null
  microsoft_message_id: string | null
  expediteur: string | null
  sujet: string | null
  recu_le: string | null
  traite: boolean
  candidat_id: string | null
  created_at: string
}

export type VuePipelineComplet = Pipeline & {
  candidat_nom: string
  candidat_prenom: string | null
  candidat_email: string | null
  titre_poste: string | null
  candidat_competences: string[]
  annees_exp: number
  offre_titre: string
  offre_competences: string[]
  exp_requise: number
}

// ─── Database type — format Supabase v2.99+ (GenericSchema compatible) ────────

export type Database = {
  public: {
    Tables: {
      candidats: {
        Row: Candidat
        Insert: {
          nom: string
          prenom?: string | null
          email?: string | null
          telephone?: string | null
          localisation?: string | null
          titre_poste?: string | null
          annees_exp?: number
          competences?: string[]
          formation?: string | null
          cv_url?: string | null
          cv_nom_fichier?: string | null
          photo_url?: string | null
          resume_ia?: string | null
          cv_texte_brut?: string | null
          statut_pipeline?: PipelineEtape | null
          tags?: string[]
          notes?: string | null
          source?: string | null
          langues?: string[] | null
          linkedin?: string | null
          permis_conduire?: boolean | null
          date_naissance?: string | null
          experiences?: Array<{ poste: string; entreprise: string; periode: string; description: string }> | null
          formations_details?: Array<{ diplome: string; etablissement: string; annee: string }> | null
          rating?: number | null
          documents?: CandidatDocument[]
          import_status?: ImportStatus
        }
        Update: {
          nom?: string
          prenom?: string | null
          email?: string | null
          telephone?: string | null
          localisation?: string | null
          titre_poste?: string | null
          annees_exp?: number
          competences?: string[]
          formation?: string | null
          cv_url?: string | null
          cv_nom_fichier?: string | null
          photo_url?: string | null
          resume_ia?: string | null
          cv_texte_brut?: string | null
          statut_pipeline?: PipelineEtape | null
          tags?: string[]
          notes?: string | null
          source?: string | null
          langues?: string[] | null
          linkedin?: string | null
          permis_conduire?: boolean | null
          date_naissance?: string | null
          experiences?: Array<{ poste: string; entreprise: string; periode: string; description: string }> | null
          formations_details?: Array<{ diplome: string; etablissement: string; annee: string }> | null
          rating?: number | null
          documents?: CandidatDocument[]
          import_status?: ImportStatus
        }
        Relationships: []
      }
      offres: {
        Row: Offre
        Insert: {
          titre: string
          departement?: string | null
          description?: string | null
          competences?: string[]
          exp_requise?: number
          localisation?: string | null
          type_contrat?: string
          salaire_min?: number | null
          salaire_max?: number | null
          statut?: OffreStatut
          notes?: string | null
          date_limite?: string | null
          client_nom?: string | null
          nb_postes?: number
          date_debut?: string | null
          duree_mission?: string | null
        }
        Update: {
          titre?: string
          departement?: string | null
          description?: string | null
          competences?: string[]
          exp_requise?: number
          localisation?: string | null
          type_contrat?: string
          salaire_min?: number | null
          salaire_max?: number | null
          statut?: OffreStatut
          notes?: string | null
          date_limite?: string | null
          client_nom?: string | null
          nb_postes?: number
          date_debut?: string | null
          duree_mission?: string | null
        }
        Relationships: []
      }
      pipeline: {
        Row: Pipeline
        Insert: {
          candidat_id: string
          offre_id: string
          etape?: PipelineEtape
          score_ia?: number | null
          score_detail?: Record<string, number> | null
          notes?: string | null
          date_entretien?: string | null
          salaire_propose?: number | null
        }
        Update: {
          candidat_id?: string
          offre_id?: string
          etape?: PipelineEtape
          score_ia?: number | null
          score_detail?: Record<string, number> | null
          notes?: string | null
          date_entretien?: string | null
          salaire_propose?: number | null
        }
        Relationships: []
      }
      notes_candidat: {
        Row: NoteCandidat
        Insert: {
          candidat_id: string
          offre_id?: string | null
          auteur: string
          contenu: string
        }
        Update: {
          candidat_id?: string
          offre_id?: string | null
          auteur?: string
          contenu?: string
        }
        Relationships: []
      }
      integrations: {
        Row: Integration
        Insert: {
          type: IntegrationType
          email?: string | null
          nom_compte?: string | null
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          actif?: boolean
          metadata?: Record<string, unknown>
        }
        Update: {
          type?: IntegrationType
          email?: string | null
          nom_compte?: string | null
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          actif?: boolean
          metadata?: Record<string, unknown>
          updated_at?: string
        }
        Relationships: []
      }
      entretiens: {
        Row: Entretien
        Insert: {
          candidat_id?: string | null
          offre_id?: string | null
          titre: string
          date_heure: string
          duree_minutes?: number
          type?: EntretienType
          lien_visio?: string | null
          lieu?: string | null
          notes?: string | null
          statut?: EntretienStatut
          intervieweur?: string | null
        }
        Update: {
          candidat_id?: string | null
          offre_id?: string | null
          titre?: string
          date_heure?: string
          duree_minutes?: number
          type?: EntretienType
          lien_visio?: string | null
          lieu?: string | null
          notes?: string | null
          statut?: EntretienStatut
          intervieweur?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: EmailTemplate
        Insert: {
          nom: string
          sujet: string
          corps: string
          categorie?: EmailTemplateCategorie
        }
        Update: {
          nom?: string
          sujet?: string
          corps?: string
          categorie?: EmailTemplateCategorie
          updated_at?: string
        }
        Relationships: []
      }
      emails_envoyes: {
        Row: EmailEnvoye
        Insert: {
          candidat_id?: string | null
          integration_id?: string | null
          sujet: string
          corps: string
          destinataire: string
          statut?: 'envoye' | 'erreur'
          microsoft_message_id?: string | null
        }
        Update: {
          candidat_id?: string | null
          integration_id?: string | null
          sujet?: string
          corps?: string
          destinataire?: string
          statut?: 'envoye' | 'erreur'
          microsoft_message_id?: string | null
        }
        Relationships: []
      }
      emails_recus: {
        Row: EmailRecu
        Insert: {
          integration_id?: string | null
          microsoft_message_id?: string | null
          expediteur?: string | null
          sujet?: string | null
          recu_le?: string | null
          traite?: boolean
          candidat_id?: string | null
        }
        Update: {
          integration_id?: string | null
          microsoft_message_id?: string | null
          expediteur?: string | null
          sujet?: string | null
          recu_le?: string | null
          traite?: boolean
          candidat_id?: string | null
        }
        Relationships: []
      }
      logs_activite: {
        Row: {
          id: string
          action: string
          user_id: string | null
          user_email: string | null
          details: Record<string, unknown>
          ip: string | null
          created_at: string
        }
        Insert: {
          action: string
          user_id?: string | null
          user_email?: string | null
          details?: Record<string, unknown>
          ip?: string | null
          created_at?: string
        }
        Update: {
          action?: string
          user_id?: string | null
          user_email?: string | null
          details?: Record<string, unknown>
          ip?: string | null
        }
        Relationships: []
      }
      demandes_acces: {
        Row: {
          id: string
          prenom: string
          nom: string
          entreprise: string
          email: string
          statut: 'en_attente' | 'approuve' | 'refuse'
          created_at: string
        }
        Insert: {
          prenom: string
          nom: string
          entreprise: string
          email: string
          statut?: 'en_attente' | 'approuve' | 'refuse'
          created_at?: string
        }
        Update: {
          statut?: 'en_attente' | 'approuve' | 'refuse'
        }
        Relationships: []
      }
    }
    Views: {
      vue_pipeline_complet: {
        Row: VuePipelineComplet
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: {
      pipeline_etape: PipelineEtape
      offre_statut: OffreStatut
    }
    CompositeTypes: Record<string, never>
  }
}

export type CandidatInsert = Database['public']['Tables']['candidats']['Insert']
export type OffreInsert = Database['public']['Tables']['offres']['Insert']
export type PipelineInsert = Database['public']['Tables']['pipeline']['Insert']
