import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Lock, LogOut, Save, ShieldCheck, Upload, Trash2 } from "lucide-react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { zerodb } from "@/integrations/zerodb/client";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { nowIso } from "@/lib/audit";
import { compressAvatar } from "@/lib/image";
import { findProfileByUserId } from "@/lib/queries";
import { toast } from "sonner";

const nameSchema = z.string().trim().min(1).max(100);

export default function Settings() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileRowId, setProfileRowId] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await findProfileByUserId(user.id);
        if (profile) {
          setProfileRowId(profile.id);
          setDisplayName(profile.display_name ?? "");
          setAvatarUrl(profile.avatar_url ?? null);
        }
      } catch {
        // Swallow errors on initial profile load — missing profile is expected for new users
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setCompressing(true);
    try {
      const dataUrl = await compressAvatar(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      toast.error((err as Error).message || "Could not process image");
    } finally {
      setCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const parsed = nameSchema.safeParse(displayName);
    if (!parsed.success) { toast.error("Display name is required (max 100 chars)"); return; }
    setSavingProfile(true);
    try {
      // Write email into BOTH `id` and `user_id` inside row_data (#34).
      // The proxy is known to drop fields not declared in the bootstrap
      // schema; `user_id` isn't declared there, so mirroring it into `id`
      // (which the unwrap in client.ts always preserves) keeps the row
      // findable even if `user_id` is stripped server-side.
      const body = {
        id: user.id,
        user_id: user.id,
        display_name: parsed.data,
        avatar_url: avatarUrl ?? "",
        updated_at: nowIso(),
      };
      if (profileRowId) {
        await zerodb.tables.update("profiles", profileRowId, body);
      } else {
        const created = await zerodb.tables.insert("profiles", {
          ...body,
          created_at: nowIso(),
        });
        setProfileRowId(created.id);
      }
      qc.invalidateQueries({ queryKey: ["profile", user.id] });

      // Read-back verify: if the row isn't findable after a save, surface
      // a clear error instead of misleading the user with a success toast
      // and letting them discover it on reload.
      const verify = await findProfileByUserId(user.id);
      if (!verify) {
        toast.error(
          "Profile was sent but cannot be found on read-back. Check the browser console and report this.",
        );
        console.error("[settings] profile save did not persist", { userId: user.id, body });
        return;
      }
      // Re-sync local state from what's actually stored, in case the
      // server normalised anything (e.g. truncated avatar_url).
      setProfileRowId(verify.id);
      setDisplayName(verify.display_name ?? parsed.data);
      setAvatarUrl(verify.avatar_url ?? null);
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
                <div className="space-y-2">
                  <Label>Photo</Label>
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        (displayName || user?.email || "?").trim().charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onPickAvatar(e.target.files?.[0] ?? undefined)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={compressing}
                      >
                        {compressing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        {avatarUrl ? "Replace" : "Upload"} photo
                      </Button>
                      {avatarUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAvatarUrl(null)}
                          disabled={compressing}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Remove
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">JPG/PNG up to a few MB. Resized to 256px on save.</p>
                    </div>
                  </div>
                </div>
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
              <h3 className="font-bold mb-1">Password</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Change your personal CRM login password.
              </p>
              <Button variant="outline" onClick={() => navigate("/settings/password")}>
                <Lock className="h-4 w-4 mr-2" /> Change password
              </Button>
            </section>

            {isAdmin && (
              <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
                <h3 className="font-bold mb-1">Admin tools</h3>
                <p className="text-sm text-muted-foreground mb-3">Diagnostics and data inspection for admins.</p>
                <Button asChild variant="outline">
                  <Link to="/admin/diagnostics">Contact diagnostics</Link>
                </Button>
              </section>
            )}

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
