import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { zerodb, ZeroDBError } from "@/integrations/zerodb/client";
import { passwordSchema, PASSWORD_HINT } from "@/lib/password";
import { toast } from "sonner";

export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate new password against policy
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setSubmitting(true);
    try {
      // Delegate to the ZeroDB auth client (#16).
      await zerodb.auth.changePassword(currentPassword, newPassword);

      toast.success("Password changed successfully.");
      navigate("/settings", { replace: true });
    } catch (err: unknown) {
      if (err instanceof ZeroDBError) {
        if (err.status === 401 || err.status === 403) {
          toast.error("Current password is incorrect.");
        } else {
          toast.error("Could not change password. Please try again.");
        }
      } else {
        toast.error("Could not change password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-lg mx-auto">
        <PageHeader
          title="Change password"
          description="Update your CRM login password."
        />

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <section className="bg-card border border-border rounded-xl p-6 shadow-elegant space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={PASSWORD_HINT}
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Change password
            </Button>
          </section>
        </form>
      </div>
    </AppLayout>
  );
}
