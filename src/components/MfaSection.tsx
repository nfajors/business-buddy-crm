import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

type Factor = { id: string; status: string; friendly_name?: string | null };

export function MfaSection() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setEnrolling(false);
    if (error || !data) { toast.error(error?.message ?? "Could not start enrollment"); return; }
    setPending({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async () => {
    if (!pending) return;
    setVerifying(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: pending.id });
    if (chErr || !ch) { setVerifying(false); toast.error(chErr?.message ?? "Challenge failed"); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: pending.id, challengeId: ch.id, code });
    setVerifying(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Two-factor authentication enabled");
    setPending(null); setCode(""); refresh();
  };

  const cancelEnroll = async () => {
    if (pending) await supabase.auth.mfa.unenroll({ factorId: pending.id });
    setPending(null); setCode(""); refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Two-factor authentication removed");
    refresh();
  };

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
      <h3 className="font-bold mb-1 flex items-center gap-2">
        {verified.length > 0 ? <ShieldCheck className="h-4 w-4 text-gold" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
        Two-factor authentication
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Add an authenticator app (1Password, Authy, Google Authenticator) for an extra layer of security.
      </p>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      ) : pending ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={pending.qr} alt="MFA QR code" className="h-40 w-40 border border-border rounded bg-white p-2" />
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Scan the QR code, or enter the secret manually:</p>
              <code className="block px-2 py-1 bg-muted rounded text-xs break-all">{pending.secret}</code>
            </div>
          </div>
          <div className="space-y-1.5 max-w-xs">
            <Label>6-digit code</Label>
            <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
          </div>
          <div className="flex gap-2">
            <Button onClick={verify} disabled={verifying || code.length !== 6}>
              {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Verify & enable
            </Button>
            <Button variant="outline" onClick={cancelEnroll}>Cancel</Button>
          </div>
        </div>
      ) : verified.length > 0 ? (
        <div className="space-y-2">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-sm border border-border rounded px-3 py-2">
              <span>Authenticator app {f.friendly_name ? `(${f.friendly_name})` : ""}</span>
              <Button variant="ghost" size="sm" onClick={() => remove(f.id)}>Remove</Button>
            </div>
          ))}
        </div>
      ) : (
        <Button onClick={startEnroll} disabled={enrolling}>
          {enrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Set up two-factor
        </Button>
      )}
    </section>
  );
}