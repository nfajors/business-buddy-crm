import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Save, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { zerodb, ZeroDBError } from "@/integrations/zerodb/client";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { stampForUpdate, nowIso } from "@/lib/audit";
import { toast } from "sonner";

const nameSchema = z.string().trim().min(1).max(100);

export default function Settings() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await zerodb.tables.get("profiles", user.id);
        setDisplayName(profile?.display_name ?? "");
      } catch (err) {
        if (!(err instanceof ZeroDBError) || err.status !== 404) {
          toast.error("Could not load profile");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    const parsed = nameSchema.safeParse(displayName);
    if (!parsed.success) { toast.error("Display name is required (max 100 chars)"); return; }
    setSavingProfile(true);
    try {
      try {
        await zerodb.tables.update("profiles", user.id, stampForUpdate({ display_name: parsed.data }));
      } catch (err) {
        // First-time profile write — create instead of update.
        if (err instanceof ZeroDBError && err.status === 404) {
          await zerodb.tables.insert("profiles", {
            id: user.id,
            display_name: parsed.data,
            created_at: nowIso(),
            updated_at: nowIso(),
          });
        } else {
          throw err;
        }
      }
      toast.success("Profile updated");
    } catch (err) {
      toast.error((err as Error).message || "Could not save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate("/auth", { replace: true }); };

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-3xl mx-auto">
        <PageHeader title="Settings" description="Manage your profile and account." />
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : (
          <div className="space-y-6">
            <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
              <h3 className="font-bold mb-1">Profile</h3>
              <p className="text-sm text-muted-foreground mb-4">How your name appears across the workspace.</p>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
                <div className="space-y-1.5"><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} /></div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <div className="flex items-center gap-2 text-sm">
                    {isAdmin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-gold-dark font-semibold"><ShieldCheck className="h-3 w-3" /> Admin</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted">User</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Last sign-in</Label>
                  <div className="text-sm text-muted-foreground">
                    {user?.last_sign_in_at ? format(new Date(user.last_sign_in_at), "PPpp") : "—"}
                  </div>
                </div>
                <Button onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save profile
                </Button>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
              <h3 className="font-bold mb-1">Password & two-factor</h3>
              <p className="text-sm text-muted-foreground">
                Self-serve password change and two-factor enrollment are
                temporarily unavailable while we migrate the backend.
                Contact an admin if you need either.
              </p>
            </section>

            <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
              <h3 className="font-bold mb-1">Account</h3>
              <Button variant="outline" onClick={handleSignOut} className="mt-2"><LogOut className="h-4 w-4 mr-2" /> Sign out</Button>
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
