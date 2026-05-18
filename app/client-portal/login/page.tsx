import { Suspense } from 'react'
import LoginForm from '@/components/portal-auth/LoginForm'

export const dynamic = 'force-dynamic'

export default function ClientPortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm accountType="client" basePath="/client-portal" />
    </Suspense>
  )
}
