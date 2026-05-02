import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand, BrandText } from "@/components/Brand";
const plans = [
  { name: "Starter", price: "Free", description: "For solo career coaches getting started.", features: ["Up to 100 contacts", "Pipeline & notes", "Single user", "Email support"], cta: "Get started", highlighted: false },
  { name: "Pro", price: "$4.99", period: "/month", description: "Everything you need to scale outreach.", features: ["Unlimited contacts", "Multi-user team workspace", "Activity timeline", "Priority support", "Admin role management"], cta: "Start Pro trial", highlighted: true },
];
export default function Pricing() {
  return (
    <div className="min-h-screen gradient-hero">
      <header className="container mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/"><Brand className="h-9" /></Link>
        <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
      </header>
      <section className="container mx-auto px-6 py-20 text-center max-w-4xl">
        <h1 className="text-5xl font-black">Simple, focused pricing.</h1>
        <p className="text-lg text-muted-foreground mt-4">One low price for everything you need to win careers.</p>
        <div className="grid md:grid-cols-2 gap-6 mt-12 text-left">
          {plans.map((p) => (
            <div key={p.name} className={`rounded-2xl p-8 border shadow-elegant relative ${p.highlighted ? "border-gold bg-card shadow-gold" : "border-border bg-card"}`}>
              {p.highlighted && <span className="absolute -top-3 left-8 bg-gold text-ink text-xs font-bold px-3 py-1 rounded-full">RECOMMENDED</span>}
              <h3 className="text-xl font-bold">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black">{p.price}</span>
                {p.period && <span className="text-muted-foreground">{p.period}</span>}
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-gold-dark mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full mt-8" variant={p.highlighted ? "default" : "outline"}>
                <Link to="/auth?mode=signup">{p.cta} <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} <BrandText className="text-sm" />
      </footer>
    </div>
  );
}
