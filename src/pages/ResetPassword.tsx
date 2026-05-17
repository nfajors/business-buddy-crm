import { Link } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

const RESET_ADMIN_EMAIL = "nf@winning.careers";
const RESET_MAILTO = `mailto:${RESET_ADMIN_EMAIL}?subject=${encodeURIComponent(
  "CRM password reset request",
)}&body=${encodeURIComponent(
  "Hi Nick,\n\nPlease reset my CRM account password.\n\nThanks!",
)}`;

export default function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <Brand className="h-9" />
        </div>
        <h1 className="text-2xl font-bold">Password resets are admin-mediated</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Password resets are handled by the Winning.Careers admin.
          Click below to email{" "}
          <a href={`mailto:${RESET_ADMIN_EMAIL}`} className="text-gold-dark font-semibold hover:underline">
            {RESET_ADMIN_EMAIL}
          </a>{" "}
          and request a reset.
        </p>
        <Button asChild className="mt-6 w-full shadow-gold">
          <a href={RESET_MAILTO}>Email admin to reset</a>
        </Button>
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
