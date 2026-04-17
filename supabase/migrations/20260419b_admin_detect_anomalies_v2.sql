-- 20260419b_admin_detect_anomalies_v2.sql
-- v1.9.18 : exclut les anomalies déjà résolues (si cv_url actuel = resolved_cv_url).
-- Remplace la version v1.9.17.

CREATE OR REPLACE FUNCTION public.admin_detect_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  texte_anomalies    jsonb;
  onedrive_anomalies jsonb;
  cv_orphan          jsonb;
BEGIN
  -- A. cv_texte_brut ne contient nulle part ni nom ni prénom (full scan)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO texte_anomalies
  FROM (
    SELECT c.id, c.nom, c.prenom, c.cv_nom_fichier, c.email, c.telephone, c.updated_at,
           LEFT(c.cv_texte_brut, 300) AS extrait
    FROM candidats c
    WHERE c.cv_texte_brut IS NOT NULL AND LENGTH(c.cv_texte_brut) > 100
      AND c.cv_texte_brut NOT LIKE '[scan-non-lisible]%'
      AND c.cv_texte_brut NOT LIKE '[pdf-chiffre]%'
      AND LENGTH(c.nom) > 2 AND LENGTH(c.prenom) > 2
      AND unaccent(LOWER(c.cv_texte_brut)) NOT LIKE '%' || unaccent(LOWER(c.nom)) || '%'
      AND unaccent(LOWER(c.cv_texte_brut)) NOT LIKE '%' || unaccent(LOWER(c.prenom)) || '%'
      AND NOT EXISTS (
        SELECT 1 FROM anomalies_resolved r
        WHERE r.candidat_id = c.id
          AND r.anomaly_type = 'texte_mismatch'
          AND COALESCE(r.resolved_cv_url, '') = COALESCE(c.cv_url, '')
      )
    ORDER BY c.updated_at DESC LIMIT 100
  ) t;

  -- B. Imports OneDrive 48h dont nom_fichier ne matche ni nom ni prénom
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO onedrive_anomalies
  FROM (
    SELECT c.id, c.nom, c.prenom, of.nom_fichier, of.traite_le, of.id AS onedrive_id
    FROM candidats c JOIN onedrive_fichiers of ON of.candidat_id = c.id
    WHERE of.traite_le > NOW() - INTERVAL '48 hours'
      AND of.statut_action = 'updated'
      AND LENGTH(c.nom) > 2 AND LENGTH(c.prenom) > 2
      AND unaccent(LOWER(of.nom_fichier)) NOT LIKE '%' || unaccent(LOWER(c.nom)) || '%'
      AND unaccent(LOWER(of.nom_fichier)) NOT LIKE '%' || unaccent(LOWER(c.prenom)) || '%'
      AND of.nom_fichier NOT ILIKE 'CV\_20%'
      AND NOT EXISTS (
        SELECT 1 FROM anomalies_resolved r
        WHERE r.candidat_id = c.id
          AND r.anomaly_type = 'onedrive_mismatch'
          AND COALESCE(r.resolved_cv_url, '') = COALESCE(c.cv_url, '')
      )
    ORDER BY of.traite_le DESC LIMIT 100
  ) t;

  -- C. cv_url orphelin (objet storage inexistant)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO cv_orphan
  FROM (
    SELECT c.id, c.nom, c.prenom, c.cv_nom_fichier, c.updated_at,
           regexp_replace(c.cv_url, '.*/sign/cvs/([^?]+).*', '\1') AS storage_path
    FROM candidats c
    WHERE c.cv_url LIKE '%supabase.co/storage/v1/object/sign/cvs/%'
      AND NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'cvs'
          AND o.name = regexp_replace(c.cv_url, '.*/sign/cvs/([^?]+).*', '\1')
      )
      AND NOT EXISTS (
        SELECT 1 FROM anomalies_resolved r
        WHERE r.candidat_id = c.id
          AND r.anomaly_type = 'cv_orphan'
          AND COALESCE(r.resolved_cv_url, '') = COALESCE(c.cv_url, '')
      )
    ORDER BY c.updated_at DESC LIMIT 100
  ) t;

  RETURN jsonb_build_object(
    'scan_at', NOW(),
    'texte_mismatch', texte_anomalies,
    'onedrive_mismatch', onedrive_anomalies,
    'cv_orphan', cv_orphan,
    'total', jsonb_array_length(texte_anomalies) + jsonb_array_length(onedrive_anomalies) + jsonb_array_length(cv_orphan)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_detect_anomalies() IS
'v1.9.18 : scan observabilite 3 familles (texte_mismatch, onedrive_mismatch, cv_orphan) — exclut les cas deja dans anomalies_resolved si cv_url inchange. Accessible uniquement service_role.';
