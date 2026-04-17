-- Seed du template par défaut "Proposition de candidature"
-- Idempotent : on ne le crée que s'il n'existe pas déjà (par nom).

INSERT INTO email_templates (nom, categorie, sujet, corps)
SELECT
  'Proposition de candidature',
  'offre',
  'Proposition de profil — {candidat_metier}',
  $body$Bonjour {client_prenom} {client_nom},

J'espère que vous allez bien.

Je me permets de vous écrire pour vous proposer le profil d'{un_e} {candidat_metier}, {candidat_civilite} {candidat_prenom} {candidat_nom}.

{contexte_ia}

Je reste disponible pour vous transmettre son CV complet ou organiser une rencontre.$body$
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates WHERE nom = 'Proposition de candidature'
);
