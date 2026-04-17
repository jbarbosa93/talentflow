-- 20260418_admin_detect_anomalies.sql
-- Observabilité v1.9.17 : fonction Postgres qui détecte 3 familles d'incohérences
--   A. cv_texte_brut ne contient NULLE PART ni le nom ni le prénom du candidat
--   B. Imports OneDrive 48h avec nom_fichier qui ne matche ni nom ni prénom
--   C. cv_url pointe vers un objet storage.objects inexistant
--
-- Accès strict service_role uniquement. Appelée par /api/admin/detect-anomalies
-- (admin only via requireAdmin()).

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
  -- A. cv_texte_brut ne contient nulle part ni le nom ni le prénom (scan du texte entier)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO texte_anomalies
  FROM (
    SELECT id, nom, prenom, cv_nom_fichier, email, telephone, updated_at,
           LEFT(cv_texte_brut, 300) AS extrait
    FROM candidats
    WHERE cv_texte_brut IS NOT NULL AND LENGTH(cv_texte_brut) > 100
      AND cv_texte_brut NOT LIKE '[scan-non-lisible]%'
      AND cv_texte_brut NOT LIKE '[pdf-chiffre]%'
      AND LENGTH(nom) > 2 AND LENGTH(prenom) > 2
      AND unaccent(LOWER(cv_texte_brut)) NOT LIKE '%' || unaccent(LOWER(nom)) || '%'
      AND unaccent(LOWER(cv_texte_brut)) NOT LIKE '%' || unaccent(LOWER(prenom)) || '%'
    ORDER BY updated_at DESC LIMIT 100
  ) t;

  -- B. Imports OneDrive 48h dont nom_fichier ne contient ni nom ni prénom du candidat
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

REVOKE ALL ON FUNCTION public.admin_detect_anomalies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_detect_anomalies() FROM anon;
REVOKE ALL ON FUNCTION public.admin_detect_anomalies() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_detect_anomalies() TO service_role;

COMMENT ON FUNCTION public.admin_detect_anomalies() IS
'Scan observabilite : detecte les candidats avec cv_texte_brut/nom_fichier incoherents et les cv_url orphelins. Accessible uniquement service_role.';
