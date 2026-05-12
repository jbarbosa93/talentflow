-- v2.7.3 — Mode "Utiliser portail rapports"
-- Quand activé, la notification de signature candidat va à l'email principal
-- de l'entreprise (clients.email) avec un lien vers /client-portal/{slug}?tab=rapports
-- au lieu de /report/client/{token}.
-- Le token reste généré (defensive) — le portail est le canal préféré.

ALTER TABLE report_links
  ADD COLUMN IF NOT EXISTS use_client_portal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN report_links.use_client_portal IS
  'Si true, les notifications de signature candidat redirigent vers le portail client (slug permanent) au lieu du token éphémère.';
