import { Suspense } from 'react'
import LoginForm from '@/components/portal-auth/LoginForm'

export const dynamic = 'force-dynamic'

export default function ReportLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm accountType="candidat" basePath="/report" />
    </Suspense>
  )
}
