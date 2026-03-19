import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Strip from "@/components/landing/Strip"
import Features from "@/components/landing/Features"
import Pricing from "@/components/landing/Pricing"
import Footer from "@/components/landing/Footer"

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Strip />
      <Features />
      <Pricing />
      <Footer />
    </>
  )
}
