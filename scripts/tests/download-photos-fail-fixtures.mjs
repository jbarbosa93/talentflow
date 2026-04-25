#!/usr/bin/env node
// Télécharge les 22 CVs des candidats où l'extraction photo a échoué.
// Cible : ~/Desktop/talentflow-test-fixtures/photos-fail/
// Usage : node scripts/tests/download-photos-fail-fixtures.mjs

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const FIXTURES_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/photos-fail')

// 22 candidats observés dans les screenshots du 23/04/2026.
// Ext = extension réelle du fichier source (pdf/docx/jpg).
const MANIFEST = [
  { idx:  1, slug: 'orlando-pereira-sousa',     ext: 'jpg',  candidat_id: '9f091188-32ec-4da8-88c0-24f210bb0784', name: 'Orlando José Perreira Sousa', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774035908884_CONSTRUCTION_maneouvre_chantier_C_PEREIRA_SOUSA_orlando_jose_20.03.2024.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDAzNTkwODg4NF9DT05TVFJVQ1RJT05fbWFuZW91dnJlX2NoYW50aWVyX0NfUEVSRUlSQV9TT1VTQV9vcmxhbmRvX2pvc2VfMjAuMDMuMjAyNC5qcGciLCJpYXQiOjE3NzQwMzU5MDksImV4cCI6MjA4OTM5NTkwOX0.UmFTWpgHK2OU2XQk4OMcgCAHcYWB3KV2AOxCVZe_mic' },
  { idx:  2, slug: 'francis-fokou',              ext: 'pdf',  candidat_id: '541ec11a-6f66-4fb7-b7a2-1ee55cf18509', name: 'Francis Fokou', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774631707796_FOKOU_francis_15.03.2024_cv.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDYzMTcwNzc5Nl9GT0tPVV9mcmFuY2lzXzE1LjAzLjIwMjRfY3YucGRmIiwiaWF0IjoxNzc0NjMxNzA4LCJleHAiOjIwODk5OTE3MDh9.XfZR6LsmN8QdEI_s98GtuBun25Ly38gkK6Se2lz6Hto' },
  { idx:  3, slug: 'gaelle-jacope',              ext: 'pdf',  candidat_id: '7327b716-9f4a-4a87-abe7-1cce54e525a1', name: 'Gaëlle Jacope', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774608300419_JACOPE_gaelle_15.03.2024_femme_a__MARRON_zm.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDYwODMwMDQxOV9KQUNPUEVfZ2FlbGxlXzE1LjAzLjIwMjRfZmVtbWVfYV9fTUFSUk9OX3ptLnBkZiIsImlhdCI6MTc3NDYwODMwMCwiZXhwIjoyMDg5OTY4MzAwfQ.JbxBjE5Ph862tb3xoehaGKGBj-0iZSfrP7jwzVcG6zE' },
  { idx:  4, slug: 'ricardo-vieira',             ext: 'pdf',  candidat_id: 'bf96cd24-681f-437a-a00f-6f725b60b9dd', name: 'Ricardo Vieira', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774053566979_VIEIRA_ricardo_15.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDA1MzU2Njk3OV9WSUVJUkFfcmljYXJkb18xNS4wMy4yMDI0LnBkZiIsImlhdCI6MTc3NDA1MzU2NywiZXhwIjoyMDg5NDEzNTY3fQ.JMjfRxIF1UDCTGvSEsAgFEdXKPuKBx7CbQv3021epu8' },
  { idx:  5, slug: 'helori-rioual-dugdale',      ext: 'pdf',  candidat_id: '8291202c-6ff4-44fb-9939-bbe3b3dbe7ec', name: 'Hélori Rioual Dugdale', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774015098074_2._CV_ELECTRICITE_electricien_industriel_qualifie__ou_expe_rience_RIOUAL_DUGDALE_helori_03.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDAxNTA5ODA3NF8yLl9DVl9FTEVDVFJJQ0lURV9lbGVjdHJpY2llbl9pbmR1c3RyaWVsX3F1YWxpZmllX19vdV9leHBlX3JpZW5jZV9SSU9VQUxfRFVHREFMRV9oZWxvcmlfMDMuMDMuMjAyNC5wZGYiLCJpYXQiOjE3NzQwMTUwOTgsImV4cCI6MjA4OTM3NTA5OH0.7xX5OfTY-BlFgFZKhesAhApkzMdhfhjKHdT5KkGn_JM' },
  { idx:  6, slug: 'mariana-marques-conceicao',  ext: 'pdf',  candidat_id: 'c6d8dd88-8945-47fa-82e9-523bf037189e', name: 'Marques Mariana Da Conceição', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774696980451_MARQUES_mariana_04.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY5Njk4MDQ1MV9NQVJRVUVTX21hcmlhbmFfMDQuMDMuMjAyNC5wZGYiLCJpYXQiOjE3NzQ2OTY5ODAsImV4cCI6MjA5MDA1Njk4MH0.f-PAZ8VQpD15TDOjbLWJ6itAwsLn0BxSyl91wQcly8U' },
  { idx:  7, slug: 'diana-rodrigues-antunes',    ext: 'pdf',  candidat_id: '84950b1d-b5ed-4da2-aeef-452e3ab79fa7', name: 'Diana Filipa Rodrigues Antunes', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774690525344_RODRIGUES_ANTUNES_diana_filipa_04.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY5MDUyNTM0NF9ST0RSSUdVRVNfQU5UVU5FU19kaWFuYV9maWxpcGFfMDQuMDMuMjAyNC5wZGYiLCJpYXQiOjE3NzQ2OTA1MjUsImV4cCI6MjA5MDA1MDUyNX0.T4-upcBZupCBV9oJdQbj7Ch-rOREi1y8Jp24BxM3SnQ' },
  { idx:  8, slug: 'jose-antonio-ruiz-pinero',   ext: 'pdf',  candidat_id: '7efe3740-a74f-4dd8-8533-c973d58c3cf9', name: 'José Antonio Ruiz Pinero', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774055540411_RUIZ_PINERO_jose_antonio_04.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDA1NTU0MDQxMV9SVUlaX1BJTkVST19qb3NlX2FudG9uaW9fMDQuMDMuMjAyNC5wZGYiLCJpYXQiOjE3NzQwNTU1NDAsImV4cCI6MjA4OTQxNTU0MH0.n_a5oxk3k8_0h9m4HTstcxr2nj8_4qxhC8shwxY7yWY' },
  { idx:  9, slug: 'carlos-dionisio',            ext: 'pdf',  candidat_id: '6194c3cf-6bda-49cf-b943-ce07289dc9d3', name: 'Carlos Dionisio', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774051403714_DIONISIO_carlos_04.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDA1MTQwMzcxNF9ESU9OSVNJT19jYXJsb3NfMDQuMDMuMjAyNC5wZGYiLCJpYXQiOjE3NzQwNTE0MDMsImV4cCI6MjA4OTQxMTQwM30.iRSuHv7R0Y5Oyi5hNY4rBbxnMkKa9M3XrGTibbWGDTg' },
  { idx: 10, slug: 'umberto-coppa',              ext: 'pdf',  candidat_id: '4f570b99-e583-4599-9f69-99e1b578f636', name: 'Umberto Edoardo Coppa', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1773998433855_CONSTRUCTION_maneouvre_chantier_C_COPPA_umberto_edoardo_04.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3Mzk5ODQzMzg1NV9DT05TVFJVQ1RJT05fbWFuZW91dnJlX2NoYW50aWVyX0NfQ09QUEFfdW1iZXJ0b19lZG9hcmRvXzA0LjAzLjIwMjQucGRmIiwiaWF0IjoxNzczOTk4NDM0LCJleHAiOjIwODkzNTg0MzR9.kPb3cH43NoQZMFIxXli0R_3qPKP2bELrVVy29UAo45g' },
  { idx: 11, slug: 'jorge-alexander-martins',    ext: 'pdf',  candidat_id: 'aed833f0-596f-420d-b3b2-f70172885203', name: 'Jorge Alexander Martins', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774702963389_MARTINS_jorge_alexander_05.03.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDcwMjk2MzM4OV9NQVJUSU5TX2pvcmdlX2FsZXhhbmRlcl8wNS4wMy4yMDI0LnBkZiIsImlhdCI6MTc3NDcwMjk2MywiZXhwIjoyMDkwMDYyOTYzfQ.J8D_FvcZ55f3HpaYRdkGN4531G3jV7-SYyS2H37-cVw' },
  { idx: 12, slug: 'soraia-fialho-dos-santos',   ext: 'docx', candidat_id: '35bbbf53-d6ac-442a-bc55-5cd836fca1d8', name: 'Soraia Filipa Fialho Dos Santos', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774012787260_1774012747292_FIALHO_DOS_SANTOS_soraia_filipa_21.02.2024.docx?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDAxMjc4NzI2MF8xNzc0MDEyNzQ3MjkyX0ZJQUxIT19ET1NfU0FOVE9TX3NvcmFpYV9maWxpcGFfMjEuMDIuMjAyNC5kb2N4IiwiaWF0IjoxNzc0MDEyNzg3LCJleHAiOjIwODkzNzI3ODd9.X_wMNy9eo0KteaDic_SSwqz7jkmtnfIv5XxovyFtr54' },
  { idx: 13, slug: 'yannick-garzino',            ext: 'pdf',  candidat_id: 'b1cac1b1-7283-46af-9486-75075758ebec', name: 'Yannick Garzino (à valider — avatar YG technicien maintenance)', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774014748142_2._CV_ELECTRICITE_electricien_industriel_qualifie__ou_expe_rience_GARZINO_yannick_23.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDAxNDc0ODE0Ml8yLl9DVl9FTEVDVFJJQ0lURV9lbGVjdHJpY2llbl9pbmR1c3RyaWVsX3F1YWxpZmllX19vdV9leHBlX3JpZW5jZV9HQVJaSU5PX3lhbm5pY2tfMjMuMDIuMjAyNC5wZGYiLCJpYXQiOjE3NzQwMTQ3NDgsImV4cCI6MjA4OTM3NDc0OH0.6q_4ymealeHeSdC_LWiQ2AIitYrD-AJRE_VKHUapUo0' },
  { idx: 14, slug: 'avram-aurora',               ext: 'pdf',  candidat_id: '05fe8081-9afd-440c-9aba-c0b5c5f3d000', name: 'Avram Aurora', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774693937349_AVRAM_aurora_23.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY5MzkzNzM0OV9BVlJBTV9hdXJvcmFfMjMuMDIuMjAyNC5wZGYiLCJpYXQiOjE3NzQ2OTM5MzcsImV4cCI6MjA5MDA1MzkzN30.oxvUbd8NPPxGn9PUIzCVlphZAHZ6va-pa172ZGngiRw' },
  { idx: 15, slug: 'alice-costa',                ext: 'pdf',  candidat_id: '74d1c14e-6dc5-4fe6-ba13-a4ced669137c', name: 'Alice Costa', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774700004818_COSTA_alice_27.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDcwMDAwNDgxOF9DT1NUQV9hbGljZV8yNy4wMi4yMDI0LnBkZiIsImlhdCI6MTc3NDcwMDAwNSwiZXhwIjoyMDkwMDYwMDA1fQ.PaqbmObnKuaG55V-vfooZ7etCnvYmHPHdhvW34CXeMM' },
  { idx: 16, slug: 'avitabile-raffaele',         ext: 'pdf',  candidat_id: '5c5b73c2-c812-40c3-9ca6-2b13411fc1d4', name: 'Avitabile Raffaele', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774056511053_1774056492211_AVITABILE_raffaele_27.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDA1NjUxMTA1M18xNzc0MDU2NDkyMjExX0FWSVRBQklMRV9yYWZmYWVsZV8yNy4wMi4yMDI0LnBkZiIsImlhdCI6MTc3NDA1NjUxMSwiZXhwIjoyMDg5NDE2NTExfQ.0VaMaFEpd95SVfTH5xzP83Epdj_DaooCpa-3-FreGAA' },
  { idx: 17, slug: 'samuel-ordonez-luque',       ext: 'pdf',  candidat_id: '0d2d8fc4-cb8a-42c3-80ce-bf1c19a61830', name: 'Samuel Ordoñez Luque', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774649448029_ORDONEZ_LUQUE_samuel_27.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY0OTQ0ODAyOV9PUkRPTkVaX0xVUVVFX3NhbXVlbF8yNy4wMi4yMDI0LnBkZiIsImlhdCI6MTc3NDY0OTQ0OCwiZXhwIjoyMDkwMDA5NDQ4fQ.T8eR6asbrNrW8c3Jc55-Q3KdaLrjolZFhU4kbMpH42w' },
  { idx: 18, slug: 'martial-cotter',             ext: 'pdf',  candidat_id: '22a733d6-436b-4673-aee6-e5fb4ace995d', name: 'Martial Cotter', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774004682872_SECOND_OEUVRE_pla_trier_qualifie__ou_expe_rience_COTTER_martial_13.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDAwNDY4Mjg3Ml9TRUNPTkRfT0VVVlJFX3BsYV90cmllcl9xdWFsaWZpZV9fb3VfZXhwZV9yaWVuY2VfQ09UVEVSX21hcnRpYWxfMTMuMDIuMjAyNC5wZGYiLCJpYXQiOjE3NzQwMDQ2ODMsImV4cCI6MjA4OTM2NDY4M30.4wE5ZU6NUHZkYxPe0Q15qV6PqnffRfjAwC-4AGG5xD4' },
  { idx: 19, slug: 'lea-braun',                  ext: 'pdf',  candidat_id: '938799c4-ae47-4411-a52a-f2a2af6ab004', name: 'Lea Braun', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774695628617_BRAU_lea_14.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY5NTYyODYxN19CUkFVX2xlYV8xNC4wMi4yMDI0LnBkZiIsImlhdCI6MTc3NDY5NTYyOCwiZXhwIjoyMDkwMDU1NjI4fQ.YkAtnCLEwf2ZV2zFl8Kb8u_XSTaKahTLWFYdbPasmfQ' },
  { idx: 20, slug: 'margaux-libert',             ext: 'pdf',  candidat_id: '4f7b3793-bb8e-490a-9b4c-9f263675ed62', name: 'Margaux Libert', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774694383126_LIBERT_margaux_14.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY5NDM4MzEyNl9MSUJFUlRfbWFyZ2F1eF8xNC4wMi4yMDI0LnBkZiIsImlhdCI6MTc3NDY5NDM4MywiZXhwIjoyMDkwMDU0MzgzfQ.v8YRB_C57K_HYeJCloBWCjH80Gy2-hgueXuCGVMjAD4' },
  { idx: 21, slug: 'amelie-gorin',               ext: 'pdf',  candidat_id: 'bbbdbbe3-834a-4eaa-a7c5-af45fe22380b', name: 'Amélie Gorin', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774010083035_2._CV_FEMMES_nettoyage_GORIN_amelie_15.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDAxMDA4MzAzNV8yLl9DVl9GRU1NRVNfbmV0dG95YWdlX0dPUklOX2FtZWxpZV8xNS4wMi4yMDI0LnBkZiIsImlhdCI6MTc3NDAxMDA4MywiZXhwIjoyMDg5MzcwMDgzfQ.1h3O8uYSmsLYvgVqIEHrszWNVI8YVlbIJ3piC-1vgE4' },
  { idx: 22, slug: 'catarina-almeida',           ext: 'pdf',  candidat_id: 'd9192ddf-5efb-47ae-88d0-4f918714e2f3', name: 'Catarina Almeida', cv_url: 'https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/sign/cvs/1774699434045_ALMEIDA_catarina_19.02.2024.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xMTE2NTEzMi0xMzRlLTQ2NDgtOGVlMS0yNzc3MWNkMGE0YWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjdnMvMTc3NDY5OTQzNDA0NV9BTE1FSURBX2NhdGFyaW5hXzE5LjAyLjIwMjQucGRmIiwiaWF0IjoxNzc0Njk5NDM0LCJleHAiOjIwOTAwNTk0MzR9.6JQi9skLHuq-BeuGKvcSyozIrB34XYxzEnL_Wyo-zTw' },
]

function pad3(n) { return String(n).padStart(3, '0') }

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  console.log(`📁 ${FIXTURES_DIR}`)

  const manifest = []
  let ok = 0, fail = 0

  for (const item of MANIFEST) {
    const filename = `${pad3(item.idx)}-${item.slug}.${item.ext}`
    const target = path.join(FIXTURES_DIR, filename)

    if (fs.existsSync(target)) {
      const size = fs.statSync(target).size
      console.log(`  ⏭️  [${pad3(item.idx)}] ${filename} (${size} bytes — déjà présent)`)
      manifest.push({ idx: item.idx, filename, size, candidat_id: item.candidat_id, name: item.name })
      ok++
      continue
    }

    try {
      const t0 = Date.now()
      const res = await fetch(item.cv_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(target, buf)
      const dt = Date.now() - t0
      console.log(`  ✅ [${pad3(item.idx)}] ${filename} (${buf.length} bytes, ${dt}ms)`)
      manifest.push({ idx: item.idx, filename, size: buf.length, candidat_id: item.candidat_id, name: item.name })
      ok++
    } catch (e) {
      console.error(`  ❌ [${pad3(item.idx)}] ${filename} — ${e.message}`)
      manifest.push({ idx: item.idx, filename, size: 0, candidat_id: item.candidat_id, name: item.name, error: e.message })
      fail++
    }
  }

  // Manifest JSON for downstream scripts (test-photo-extraction.ts)
  const manifestPath = path.join(FIXTURES_DIR, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`\n📋 Manifest : ${manifestPath}`)
  console.log(`\n📊 Résultat : ${ok}/${MANIFEST.length} OK, ${fail} échecs`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
