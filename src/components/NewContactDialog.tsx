import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCreateContact } from "@/lib/mutations";

const schema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).default(""),
  title: z.string().trim().max(200).default(""),
  company: z.string().trim().max(200).default(""),
  email: z.string().trim().email().max(255).or(z.literal("")),
  city: z.string().trim().max(100).default(""),
  state: z.string().trim().max(100).default(""),
  country: z.string().trim().max(100).default(""),
});

export function NewContactDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void; }) {
  const { user } = useAuth();
  const create = useCreateContact();
  const [form, setForm] = useState({ first_name: "", last_name: "", title: "", company: "", email: "", city: "", state: "", country: "" });
  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    try {
      await create.mutateAsync({ ...parsed.data, created_by: user?.id ?? null, owner_id: user?.id ?? null });
      setForm({ first_name: "", last_name: "", title: "", company: "", email: "", city: "", state: "", country: "" });
      onOpenChange(false); onCreated();
    } catch {
      // toast handled in mutation onError
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New contact</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>First name *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>State / Region</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create contact</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
