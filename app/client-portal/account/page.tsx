import { Suspense } from 'react'
import AccountPage from '@/components/portal-auth/AccountPage'

export const dynamic = 'force-dynamic'

export default function ClientPortalAccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPage accountType="client" basePath="/client-portal" />
    </Suspense>
  )
}
