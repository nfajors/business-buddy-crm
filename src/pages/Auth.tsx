import { useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { passwordSchema, PASSWORD_HINT } from "@/lib/password";

const emailSchema = z.string().trim().email({ message: "Invalid email" }).max(255);

export default function Auth() {
  const { user, loading, signIn } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "forgot">(params.get("mode") === "forgot" ? "forgot" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  useEffect(() => {
    const m = params.get("mode");
    if (m === "forgot") setMode("forgot");
    else setMode("signin");
  }, [params]);

  if (!loading && user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const emailParsed = emailSchema.safeParse(email);
      if (!emailParsed.success) { toast.error(emailParsed.error.issues[0].message); return; }

      if (mode === "forgot") {
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase.auth.resetPasswordForEmail(emailParsed.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) { toast.error(error.message); return; }
        toast.success("If that email exists, a reset link has been sent.");
        setMode("signin");
        return;
      }

      const passParsed = passwordSchema.safeParse(password);
      if (!passParsed.success) { toast.error(passParsed.error.issues[0].message); return; }

      {
        const { error } = await signIn(emailParsed.data, passParsed.data);
        if (error) {
          toast.error(error.includes("Invalid") ? "Invalid email or password." : error);
          return;
        }
        toast.success("Welcome back!");
        navigate(from, { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-10 gradient-dark text-white">
        <div />
        <div>
          <h2 className="text-4xl font-black leading-tight">
            Winning.Careers <span className="text-gold">internal CRM.</span>
          </h2>
          <p className="text-white/70 mt-4 max-w-md">
            Staff workspace for managing B2B outreach to universities and career-services partners.
          </p>
        </div>
        <div className="text-xs text-white/50">© {new Date().getFullYear()} Winning.Careers</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:justify-start">
            <Brand className="h-12 w-auto max-w-[260px] object-contain" />
          </div>
          <h1 className="text-2xl font-bold">
            {mode === "signin" ? "Sign in" : "Reset password"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin"
              ? "Welcome back. Pick up where you left off."
              : "Enter your email and we'll send you a reset link."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-gold-dark font-semibold hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={PASSWORD_HINT}
                  autoComplete="current-password"
                  required
                />
              </div>
            )}

            <Button type="submit" className="w-full shadow-gold" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Send reset link"}
            </Button>
          </form>

          {mode === "forgot" && (
            <p className="text-sm text-muted-foreground text-center mt-6">
              Remembered it?{" "}
              <button type="button" onClick={() => setMode("signin")} className="text-gold-dark font-semibold hover:underline">
                Back to sign in
              </button>
            </p>
          )}
          {mode === "signin" && (
            <p className="text-xs text-muted-foreground text-center mt-6">
              Accounts are provisioned by an admin. Contact the team if you need access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}