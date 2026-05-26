// TalentFlow Sign — Page templates (refonte v2.2.1 inspirée DocuSign)
'use client'

import TemplatesPageContent from '@/components/sign/TemplatesPageContent'

// v2.9.66 — Route Signatures : affiche les templates avec kind='envelope' (exclut rapports)
export default function SignTemplatesPage() {
  return <TemplatesPageContent kindFilter="envelope" />
}
