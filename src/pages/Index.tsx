import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Users, Kanban, BarChart3, ShieldCheck, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand, BrandText } from "@/components/Brand";
import { useAuth } from "@/hooks/useAuth";

const features = [
  { icon: Users, title: "Unified Contacts", body: "100+ career-services leads loaded out of the box, ready to manage." },
  { icon: Kanban, title: "Visual Pipeline", body: "Drag contacts across outreach stages, from New to Closed." },
  { icon: BarChart3, title: "Live Dashboard", body: "Track conversions, response rates, and team activity in real time." },
  { icon: ShieldCheck, title: "Multi-User & Secure", body: "Invite your whole team. Role-based access, encrypted at rest." },
];

export default function Index() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen gradient-hero">
      <header className="container mx-auto px-6 py-5 flex items-center justify-between">
        <Brand className="h-9" />
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth?mode=signup">Get started</Link>
          </Button>
        </div>
      </header>

      <section className="container mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-xs font-bold text-gold-dark mb-6">
          <Sparkles className="h-3 w-3" /> PURPOSE · PASSION · PRECISION
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight max-w-3xl mx-auto leading-tight">
          The CRM built for <span className="text-gold">career services</span> teams.
        </h1>
        <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
          Bridge the gap between ambitious individuals and specialized knowledge. Manage your outreach,
          pipeline, and relationships in one focused workspace.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" className="shadow-gold">
            <Link to="/auth?mode=signup">
              Start free <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>

      <section className="container mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-card border border-border rounded-xl p-6 shadow-elegant hover:shadow-hover transition-smooth"
            >
              <div className="h-10 w-10 rounded-lg gradient-gold flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-ink" />
              </div>
              <h3 className="font-bold text-lg">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-white py-20">
        <div className="container mx-auto px-6 text-center max-w-2xl">
          <h2 className="text-4xl font-bold">Ready to win more careers?</h2>
          <p className="text-white/70 mt-4">Sign up in seconds. Your team can be tracking outreach today.</p>
          <Button asChild size="lg" className="mt-8 shadow-gold">
            <Link to="/auth?mode=signup">Create your account</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} <BrandText className="text-sm" /> · All rights reserved
      </footer>
    </div>
  );
}
