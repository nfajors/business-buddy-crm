import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Building2, Globe, MapPin, Linkedin, Loader2, Trash2, Send, Pencil } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StageBadge } from "@/components/StageBadge";
import { PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EditContactDialog } from "@/components/EditContactDialog";
import { useContact, useContactActivities, useContactNotes } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useAddNote, useDeleteContact, useUpdateStage } from "@/lib/mutations";

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [noteText, setNoteText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();

  const { data: contact, isLoading } = useContact(id);
  const { data: notes = [] } = useContactNotes(id);
  const { data: activities = [] } = useContactActivities(id, 20);
  const updateStage = useUpdateStage();
  const addNote = useAddNote(id ?? "");
  const deleteContact = useDeleteContact();

  const onChangeStage = (stage: PipelineStage) => {
    if (!contact || contact.pipeline_stage === stage) return;
    updateStage.mutate({ id: contact.id, stage });
  };
  const onAddNote = () => {
    if (!contact || !user) return;
    const trimmed = noteText.trim().slice(0, 2000);
    if (!trimmed) return;
    addNote.mutate({ content: trimmed, authorId: user.id }, { onSuccess: () => setNoteText("") });
  };
  const onDelete = () => {
    if (!contact) return;
    deleteContact.mutate(contact.id, { onSuccess: () => navigate("/contacts") });
  };

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div></AppLayout>;
  if (!contact) return (
    <AppLayout>
      <div className="px-6 py-12 text-center">
        <p className="text-muted-foreground">Contact not found.</p>
        <Button asChild className="mt-4"><Link to="/contacts">Back to contacts</Link></Button>
      </div>
    </AppLayout>
  );

  const canEdit = isAdmin || contact.created_by === user?.id || contact.owner_id === user?.id;

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto">
        <Link to="/contacts" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to contacts
        </Link>
        <div className="bg-card border border-border rounded-xl p-6 lg:p-8 shadow-elegant">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full gradient-gold flex items-center justify-center text-ink text-xl font-bold">
                {(contact.first_name?.[0] ?? "?").toUpperCase()}{(contact.last_name?.[0] ?? "").toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{contact.first_name} {contact.last_name}</h1>
                <p className="text-muted-foreground">{contact.title}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Building2 className="h-3.5 w-3.5" /> {contact.company}</p>
              </div>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <StageBadge stage={contact.pipeline_stage as PipelineStage} />
              <Select value={contact.pipeline_stage} onValueChange={(v) => onChangeStage(v as PipelineStage)} disabled={updateStage.isPending}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-8 text-sm">
            {contact.email && <Field icon={Mail} label="Email" value={contact.email} href={`mailto:${contact.email}`} />}
            {contact.work_phone && <Field icon={Phone} label="Work" value={contact.work_phone} href={`tel:${contact.work_phone}`} />}
            {contact.mobile_phone && <Field icon={Phone} label="Mobile" value={contact.mobile_phone} href={`tel:${contact.mobile_phone}`} />}
            {contact.website && <Field icon={Globe} label="Website" value={contact.website} href={contact.website} external />}
            {contact.linkedin && <Field icon={Linkedin} label="LinkedIn" value="View profile" href={contact.linkedin} external />}
            {(contact.city || contact.state) && (
              <Field icon={MapPin} label="Location" value={[contact.city, contact.state, contact.country].filter(Boolean).join(", ")} />
            )}
          </div>
          {canEdit && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit contact
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" /> Delete contact
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
                      <AlertDialogDescription>This permanently removes the contact, notes, and activity. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </div>
        <EditContactDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} onSaved={() => {
          qc.invalidateQueries({ queryKey: ["contact", id] });
          qc.invalidateQueries({ queryKey: ["contacts"] });
        }} />
        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-elegant">
            <h3 className="font-bold mb-4">Notes</h3>
            <div className="space-y-2">
              <Textarea placeholder="Add a note about this contact…" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} maxLength={2000} />
              <Button size="sm" onClick={onAddNote} disabled={!noteText.trim() || addNote.isPending}>
                {addNote.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Add note
              </Button>
            </div>
            <div className="mt-6 space-y-3">
              {notes.length === 0 && <p className="text-sm text-muted-foreground">Add the first note to track what was said.</p>}
              {notes.map((n) => (
                <div key={n.id} className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-elegant">
            <h3 className="font-bold mb-4">Activity timeline</h3>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-4">
                {activities.map((a) => (
                  <li key={a.id} className="pl-4 ml-2">
                    <span className="absolute -left-1.5 h-3 w-3 rounded-full bg-gold border-2 border-background" />
                    <p className="text-sm">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Field({ icon: Icon, label, value, href, external }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; href?: string; external?: boolean }) {
  const inner = (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-gold-dark mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
  if (href) return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="hover:text-gold-dark transition-smooth">{inner}</a>;
  return inner;
}
