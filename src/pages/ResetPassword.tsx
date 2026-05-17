import { Link } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

// Stub page. The Supabase recovery-link flow doesn't exist on ZeroDB yet
// (#4 follow-up). Until the public reset endpoint ships, resets are
// admin-mediated — kept as a route so old recovery emails still resolve.
export default function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <Brand className="h-9" />
        </div>
        <h1 className="text-2xl font-bold">Password resets are admin-mediated</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Self-serve password reset is temporarily unavailable while we migrate
          the backend. Contact a Winning.Careers admin and they'll reset it for
          you.
        </p>
        <Button asChild className="mt-6 w-full shadow-gold">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
