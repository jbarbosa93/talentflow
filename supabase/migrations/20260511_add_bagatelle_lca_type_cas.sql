-- v2.6.2 — Ajouter 'Bagatelle' et 'LCA Maladie' au CHECK constraint type_cas
-- À appliquer via Supabase Studio SQL Editor si le MCP est KO
-- Après application, relancer: node --env-file=.env.local scripts/fix-bagatelle-type-cas.mjs

ALTER TABLE secretariat_accidents DROP CONSTRAINT IF EXISTS secretariat_accidents_type_cas_check;
ALTER TABLE secretariat_accidents ADD CONSTRAINT secretariat_accidents_type_cas_check
  CHECK (type_cas IN ('Accident', 'Maladie', 'Bagatelle', 'LCA Maladie'));

-- Mettre à jour les 15 enregistrements Bagatelle dont type_cas est resté 'Accident' faute de constraint
UPDATE secretariat_accidents SET type_cas = 'Bagatelle' WHERE id IN (
  '1cb69635-9bcf-4562-9ffd-5c17e89e4d8c',
  '98d871a2-ed77-446e-9ce9-54ef37803e49',
  '96d20eac-8881-4aec-924d-929ad913c258',
  'ea855215-de2c-4644-b907-59ca5dc33928',
  '1c628cf8-cc4a-419b-acff-3dc1f59b3856',
  '2a617e89-427f-42cc-9f98-7f303ac26275',
  '4f8d5978-5273-4176-9b04-2ab6595f23dc',
  '9e8c39ae-4315-4c1a-9166-4dcc6c4da98c',
  '9779e0c2-5ce0-47e5-a7de-82cfeaa0d796',
  'f5d7bdb3-7fa6-4fa9-bc7e-a41f129d53d1',
  '2222f839-c3f7-4320-a9de-3ec6c44e21f8',
  'fb7706e5-1fc5-4403-86f3-edd124900d48',
  '3d29c8d3-2dc6-4f55-8a1e-b4573fca4852',
  'b93caa15-12e0-4aea-8a8b-f1f52399a2d7',
  'b2fe86df-83f7-45df-80e1-99d6f04215a6'
);
