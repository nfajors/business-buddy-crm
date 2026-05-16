import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Save, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { passwordSchema, PASSWORD_HINT } from "@/lib/password";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { MfaSection } from "@/components/MfaSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
const nameSchema = z.string().trim().min(1).max(100);
export default function Settings() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      setDisplayName(data?.display_name ?? "");
      setLoading(false);
    })();
  }, [user]);
  const saveProfile = async () => {
    if (!user) return;
    const parsed = nameSchema.safeParse(displayName);
    if (!parsed.success) { toast.error("Display name is required (max 100 chars)"); return; }
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", user.id);
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
  };
  const changePassword = async () => {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setSavingPassword(false);
    if (error) { toast.error(error.message); return; }
    setNewPassword(""); toast.success("Password updated");
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
              <h3 className="font-bold mb-1">Change password</h3>
              <p className="text-sm text-muted-foreground mb-4">{PASSWORD_HINT}</p>
              <div className="flex gap-2">
                <Input type="password" placeholder={PASSWORD_HINT} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <Button onClick={changePassword} disabled={savingPassword || !newPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Update
                </Button>
              </div>
            </section>
            <MfaSection />
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
