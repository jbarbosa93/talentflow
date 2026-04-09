import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Strip from "@/components/landing/Strip"
import Features from "@/components/landing/Features"
import Beta from "@/components/landing/Pricing"
import Footer from "@/components/landing/Footer"
import Particles from "@/components/magicui/particles"
import AuthHashHandler from "@/components/landing/AuthHashHandler"

export default function LandingPage() {
  return (
    <div className="landing-root" style={{ background: '#FFFDF5', minHeight: '100vh', position: 'relative' }}>
      <AuthHashHandler />
      <Particles
        className="z-0"
        quantity={60}
        color="#1C1A14"
        size={0.5}
        staticity={60}
        ease={60}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <Hero />
        <Strip />
        <Features />
        <Beta />
        <Footer />
      </div>
    </div>
  )
}
