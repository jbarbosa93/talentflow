import { Suspense } from 'react'
import AccountPage from '@/components/portal-auth/AccountPage'

export const dynamic = 'force-dynamic'

export default function ReportAccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPage accountType="candidat" basePath="/report" />
    </Suspense>
  )
}
