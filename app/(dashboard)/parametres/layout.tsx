import ParametresBackButton from './ParametresBackButton'

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ParametresBackButton />
      {children}
    </>
  )
}
