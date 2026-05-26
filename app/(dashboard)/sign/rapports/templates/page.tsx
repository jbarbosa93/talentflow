// TalentFlow Sign — Templates Rapports (route distincte, v2.9.66)
'use client'

import TemplatesPageContent from '@/components/sign/TemplatesPageContent'

// v2.9.66 — Route Rapports : affiche les templates avec kind='report' uniquement
export default function ReportTemplatesPage() {
  return <TemplatesPageContent kindFilter="report" />
}
