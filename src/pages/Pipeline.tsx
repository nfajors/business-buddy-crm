import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Contact, PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { fetchAllContacts } from "@/lib/seed";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function Pipeline() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    const data = await fetchAllContacts<Contact>("updated_at");
    setContacts(data);
    setLoading(false);
  };
  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const handleDrop = async (stage: PipelineStage) => {
    if (!draggingId) return;
    const c = contacts.find((x) => x.id === draggingId);
    setDraggingId(null);
    if (!c || c.pipeline_stage === stage) return;
    setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, pipeline_stage: stage } : x));
    const { error } = await supabase.from("contacts").update({ pipeline_stage: stage }).eq("id", c.id);
    if (error) { toast.error(error.message); load(); }
    else toast.success(`Moved to ${PIPELINE_STAGES.find((s) => s.value === stage)?.label}`);
  };
  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-[100rem] mx-auto">
        <PageHeader title="Pipeline" description="Drag contacts between stages to update outreach status." />
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {PIPELINE_STAGES.map((stage) => {
              const items = contacts.filter((c) => c.pipeline_stage === stage.value);
              return (
                <div key={stage.value} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(stage.value)}
                  className="bg-secondary/40 rounded-xl p-3 min-h-[400px] border border-border">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${stage.color}))` }} />
                      <h3 className="font-bold text-sm">{stage.label}</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((c) => (
                      <Link key={c.id} to={`/contacts/${c.id}`} draggable
                        onDragStart={() => setDraggingId(c.id)} onDragEnd={() => setDraggingId(null)}
                        className="block bg-card rounded-lg p-3 shadow-elegant hover:shadow-hover cursor-grab active:cursor-grabbing transition-smooth">
                        <div className="font-semibold text-sm">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.title}</div>
                        <div className="text-xs text-gold-dark mt-1 truncate">{c.company}</div>
                      </Link>
                    ))}
                    {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Drop here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
