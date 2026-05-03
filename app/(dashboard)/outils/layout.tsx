import OutilsBackButton from './OutilsBackButton'

export default function OutilsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OutilsBackButton />
      {children}
    </>
  )
}
