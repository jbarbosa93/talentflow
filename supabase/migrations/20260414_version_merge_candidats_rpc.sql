-- Versionnement de la RPC merge_candidats (existait uniquement dans Supabase console)
-- Utilisée par /parametres/doublons pour fusionner deux candidats
CREATE OR REPLACE FUNCTION public.merge_candidats(p_keep_id uuid, p_delete_id uuid, p_merged jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Update le candidat conservé avec les champs fusionnés
  UPDATE candidats SET
    nom               = COALESCE(p_merged->>'nom', nom),
    prenom            = p_merged->>'prenom',
    email             = p_merged->>'email',
    telephone         = p_merged->>'telephone',
    localisation      = p_merged->>'localisation',
    titre_poste       = p_merged->>'titre_poste',
    formation         = p_merged->>'formation',
    resume_ia         = p_merged->>'resume_ia',
    cv_texte_brut     = p_merged->>'cv_texte_brut',
    source            = p_merged->>'source',
    linkedin          = p_merged->>'linkedin',
    notes             = p_merged->>'notes',
    date_naissance    = p_merged->>'date_naissance',
    cv_url            = p_merged->>'cv_url',
    cv_nom_fichier    = p_merged->>'cv_nom_fichier',
    photo_url         = p_merged->>'photo_url',
    annees_exp        = (p_merged->>'annees_exp')::integer,
    permis_conduire   = (p_merged->>'permis_conduire')::boolean,
    pipeline_consultant = p_merged->>'pipeline_consultant',
    pipeline_metier   = p_merged->>'pipeline_metier',
    competences       = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_merged->'competences', '[]'::jsonb))),
    tags              = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_merged->'tags', '[]'::jsonb))),
    langues           = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_merged->'langues', '[]'::jsonb))),
    experiences       = p_merged->'experiences',
    formations_details= p_merged->'formations_details',
    updated_at        = NOW()
  WHERE id = p_keep_id;

  -- 2. Transférer pipeline (sans conflit offre_id)
  UPDATE pipeline
  SET candidat_id = p_keep_id
  WHERE candidat_id = p_delete_id
    AND (
      offre_id IS NULL
      OR offre_id NOT IN (
        SELECT offre_id FROM pipeline
        WHERE candidat_id = p_keep_id AND offre_id IS NOT NULL
      )
    );

  -- 3. Transférer notes_candidat
  UPDATE notes_candidat SET candidat_id = p_keep_id WHERE candidat_id = p_delete_id;

  -- 4. Transférer entretiens
  UPDATE entretiens SET candidat_id = p_keep_id WHERE candidat_id = p_delete_id;

  -- 5. Transférer pipeline_rappels
  UPDATE pipeline_rappels SET candidat_id = p_keep_id WHERE candidat_id = p_delete_id;

  -- 6. Rattacher onedrive_fichiers au candidat conservé
  UPDATE onedrive_fichiers SET candidat_id = p_keep_id WHERE candidat_id = p_delete_id;

  -- 7. Supprimer le doublon
  DELETE FROM candidats WHERE id = p_delete_id;
END;
$function$;
