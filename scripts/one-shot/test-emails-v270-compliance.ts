// One-shot — Envoie tous les types d'emails v2.7.0 Compliance à j.barbosa@l-agence.ch
// Pour test visuel des templates HTML.
// v2.7.1 — Usage : npx tsx scripts/one-shot/test-emails-v270-compliance.ts

import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
config({ path: path.join(projectRoot, '.env.local') })

const TARGET_EMAIL = 'j.barbosa@l-agence.ch'

async function main() {
  const { sendCandidateReminderEmail } = await import('@/lib/compliance/send-candidate-reminder')
  const { sendDocumentAlertsEmail } = await import('@/lib/compliance/send-alert-email')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📧 Test emails v2.7.0 Compliance → ' + TARGET_EMAIL)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const today = new Date()
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)
  const in14 = new Date(today); in14.setDate(today.getDate() + 14)
  const minus5 = new Date(today); minus5.setDate(today.getDate() - 5)
  const minus2 = new Date(today); minus2.setDate(today.getDate() - 2)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  // ─── 1. Email CANDIDAT J-30 (rappel doux) ──────────────────────────
  console.log('▶ 1/4 — Email candidat J-30 (rappel doux orange clair)')
  const r1 = await sendCandidateReminderEmail({
    to: TARGET_EMAIL,
    candidateFirstName: 'Mickael',
    candidateFullName: 'Mickael Voyenet',
    documentLabel: 'Permis de conduire C',
    documentSubCategory: 'C',
    expiryDate: iso(in30),
    daysLeft: 30,
  })
  console.log(' ', r1.ok ? '✓' : '❌', r1.ok ? `(id ${r1.id})` : r1.error)
  console.log('')

  // ─── 2. Email CANDIDAT J-14 (rappel urgent) ────────────────────────
  console.log('▶ 2/4 — Email candidat J-14 (urgent orange foncé)')
  const r2 = await sendCandidateReminderEmail({
    to: TARGET_EMAIL,
    candidateFirstName: 'Mickael',
    candidateFullName: 'Mickael Voyenet',
    documentLabel: 'Carte conducteur (tachygraphe)',
    documentSubCategory: null,
    expiryDate: iso(in14),
    daysLeft: 14,
  })
  console.log(' ', r2.ok ? '✓' : '❌', r2.ok ? `(id ${r2.id})` : r2.error)
  console.log('')

  // ─── 3. Email ADMIN — récap quotidien (alertes fictives variées) ───
  console.log('▶ 3/4 — Email admin récap quotidien (toi = ADMIN, tableau complet)')
  const fakeAlerts = [
    {
      document: { id: '1', label: 'Permis de conduire C', expiry_date: iso(minus5) },
      document_type: { id: 't1', name: 'Permis de conduire', category: 'permis_conduire' as const, job_types: [], requires_expiry: true, requires_photo: true, is_required_for_driver: true, display_order: 10, description: null },
      candidat: { id: 'c1', prenom: 'Mickael', nom: 'Voyenet', photo_url: null, pipeline_consultant: 'j.barbosa@l-agence.ch' },
      days_until_expiry: -5,
      severity: 'expired' as const,
      has_active_mission: true,
    },
    {
      document: { id: '2', label: 'CQC', expiry_date: iso(in14) },
      document_type: { id: 't2', name: 'CQC', category: 'qualification' as const, job_types: [], requires_expiry: true, requires_photo: true, is_required_for_driver: true, display_order: 20, description: null },
      candidat: { id: 'c1', prenom: 'Mickael', nom: 'Voyenet', photo_url: null, pipeline_consultant: 'j.barbosa@l-agence.ch' },
      days_until_expiry: 14,
      severity: 'urgent_14' as const,
      has_active_mission: true,
    },
    {
      document: { id: '3', label: 'Carte d\'identité', expiry_date: iso(minus2) },
      document_type: { id: 't3', name: 'Carte d\'identité', category: 'identite' as const, job_types: [], requires_expiry: true, requires_photo: true, is_required_for_driver: false, display_order: 60, description: null },
      candidat: { id: 'c2', prenom: 'Ibou', nom: 'Dione', photo_url: null, pipeline_consultant: null },
      days_until_expiry: -2,
      severity: 'expired' as const,
      has_active_mission: true,
    },
    {
      document: { id: '4', label: 'Permis de travail', expiry_date: iso(in30) },
      document_type: { id: 't4', name: 'Permis de travail / Visa', category: 'identite' as const, job_types: [], requires_expiry: true, requires_photo: true, is_required_for_driver: false, display_order: 70, description: null },
      candidat: { id: 'c3', prenom: 'Mamadou Fara', nom: 'Diop Niang', photo_url: null, pipeline_consultant: null },
      days_until_expiry: 22,
      severity: 'warning_30' as const,
      has_active_mission: true,
    },
  ] as any
  const r3 = await sendDocumentAlertsEmail({
    to: TARGET_EMAIL,
    audience: 'admin',
    consultantName: null,
    alerts: fakeAlerts,
    totalExpired: 2,
    totalUrgent: 1,
    totalWarning: 1,
    baseUrl,
  })
  console.log(' ', r3.ok ? '✓' : '❌', r3.ok ? `(id ${r3.id})` : r3.error)
  console.log('')

  // ─── 4. Email CONSULTANT — récap quotidien filtré (perspective Seb) ─
  console.log('▶ 4/4 — Email consultant récap quotidien (perspective consultant)')
  const r4 = await sendDocumentAlertsEmail({
    to: TARGET_EMAIL,
    audience: 'consultant',
    consultantName: 'João Barbosa',
    alerts: fakeAlerts.slice(0, 2), // sous-ensemble
    totalExpired: 1,
    totalUrgent: 1,
    totalWarning: 0,
    baseUrl,
  })
  console.log(' ', r4.ok ? '✓' : '❌', r4.ok ? `(id ${r4.id})` : r4.error)

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ 4 emails envoyés à ' + TARGET_EMAIL)
  console.log('   1. Rappel candidat J-30 (Mickael, Permis C)')
  console.log('   2. Rappel candidat J-14 (Mickael, Carte conducteur)')
  console.log('   3. Récap admin avec 4 alertes variées')
  console.log('   4. Récap consultant avec 2 alertes')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  process.exit(0)
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
