import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { passwordSchema, PASSWORD_HINT } from "@/lib/password";

const RESET_ADMIN_EMAIL = "nf@winning.careers";

export default function ChangePassword() {
  const { user, loading, mustChangePassword, changePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  const forced = mustChangePassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    const parsed = passwordSchema.safeParse(next);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (next === current) {
      toast.error("New password must be different from the current one.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await changePassword(current, parsed.data);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Password updated.");
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Brand className="h-9" />
        </div>
        <h1 className="text-2xl font-bold text-center">Change password</h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          {forced
            ? "You're signed in with a temporary password. Set a new one to continue."
            : "Set a new password for your account."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={PASSWORD_HINT}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" className="w-full shadow-gold" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update password
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Trouble changing your password?{" "}
          <a
            href={`mailto:${RESET_ADMIN_EMAIL}?subject=${encodeURIComponent("CRM password reset request")}`}
            className="text-gold-dark font-semibold hover:underline"
          >
            Email the admin
          </a>{" "}
          and they'll reset it for you.
        </p>
      </div>
    </div>
  );
}
