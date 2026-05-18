import { Suspense } from 'react'
import SetPasswordForm from '@/components/portal-auth/SetPasswordForm'

export const dynamic = 'force-dynamic'

export default function ReportSetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm accountType="candidat" basePath="/report" />
    </Suspense>
  )
}
