import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/types";

const schema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100),
  title: z.string().trim().max(200),
  company: z.string().trim().max(200),
  email: z.string().trim().email().max(255).or(z.literal("")),
  work_phone: z.string().trim().max(50),
  mobile_phone: z.string().trim().max(50),
  website: z.string().trim().max(255),
  linkedin: z.string().trim().max(255),
  city: z.string().trim().max(100),
  state: z.string().trim().max(100),
  country: z.string().trim().max(100),
});

type FormState = z.infer<typeof schema>;

export function EditContactDialog({ open, onOpenChange, contact, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; contact: Contact; onSaved: () => void; }) {
  const [form, setForm] = useState<FormState>({
    first_name: "", last_name: "", title: "", company: "", email: "",
    work_phone: "", mobile_phone: "", website: "", linkedin: "",
    city: "", state: "", country: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        first_name: contact.first_name ?? "",
        last_name: contact.last_name ?? "",
        title: contact.title ?? "",
        company: contact.company ?? "",
        email: contact.email ?? "",
        work_phone: contact.work_phone ?? "",
        mobile_phone: contact.mobile_phone ?? "",
        website: contact.website ?? "",
        linkedin: contact.linkedin ?? "",
        city: contact.city ?? "",
        state: contact.state ?? "",
        country: contact.country ?? "",
      });
    }
  }, [open, contact]);

  const update = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSubmitting(true);
    const { error } = await supabase.from("contacts").update(parsed.data).eq("id", contact.id);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contact updated");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit contact</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>First name *</Label><Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => update("title", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Company</Label><Input value={form.company} onChange={(e) => update("company", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Work phone</Label><Input value={form.work_phone} onChange={(e) => update("work_phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Mobile phone</Label><Input value={form.mobile_phone} onChange={(e) => update("mobile_phone", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Website</Label><Input value={form.website} onChange={(e) => update("website", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>LinkedIn</Label><Input value={form.linkedin} onChange={(e) => update("linkedin", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>State / Region</Label><Input value={form.state} onChange={(e) => update("state", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Country</Label><Input value={form.country} onChange={(e) => update("country", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}