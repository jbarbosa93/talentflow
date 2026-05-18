import { Suspense } from 'react'
import SetPasswordForm from '@/components/portal-auth/SetPasswordForm'

export const dynamic = 'force-dynamic'

export default function ClientPortalSetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm accountType="client" basePath="/client-portal" />
    </Suspense>
  )
}
