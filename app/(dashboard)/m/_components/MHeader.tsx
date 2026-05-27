'use client'
// TalentFlow Mobile /m — Header compact réutilisable (v2.9.72)
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  back?: boolean | string  // true = router.back(), string = href explicite
  action?: ReactNode
}

export default function MHeader({ title, back, action }: Props) {
  const router = useRouter()
  return (
    <header className="m-header">
      {back && (
        <button
          type="button"
          className="m-header-back"
          aria-label="Retour"
          onClick={() => {
            if (typeof back === 'string') router.push(back)
            else router.back()
          }}
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <h1 className="m-header-title">{title}</h1>
      {action}
    </header>
  )
}
