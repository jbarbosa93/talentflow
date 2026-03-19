import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Strip from "@/components/landing/Strip"
import Features from "@/components/landing/Features"
import Pricing from "@/components/landing/Pricing"
import Footer from "@/components/landing/Footer"

export default function LandingPage() {
  return (
    <div className="landing-root" style={{ background: '#FFFDF5', minHeight: '100vh' }}>
      <Navbar />
      <Hero />
      <Strip />
      <Features />
      <Pricing />
      <Footer />
    </div>
  )
}
