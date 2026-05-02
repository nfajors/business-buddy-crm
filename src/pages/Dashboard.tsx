import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, TrendingUp, MessageCircle, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { Button } from "@/components/ui/button";
import { Contact, PIPELINE_STAGES, PipelineStage, Activity } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { seedContactsIfEmpty } from "@/lib/seed";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const inserted = await seedContactsIfEmpty();
      if (inserted > 0) toast.success(`Loaded ${inserted} starter contacts`);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const load = async () => {
    setLoading(true);
    const [{ data: cData }, { data: aData }] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at", { ascending: false }),
      supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    setContacts((cData ?? []) as unknown as Contact[]);
    setActivities((aData ?? []) as unknown as Activity[]);
    setLoading(false);
  };
  const stageCount = (s: PipelineStage) => contacts.filter((c) => c.pipeline_stage === s).length;
  const stats = [
    { label: "Total contacts", value: contacts.length, icon: Users },
    { label: "Contacted", value: stageCount("contacted"), icon: MessageCircle },
    { label: "Responded", value: stageCount("responded"), icon: TrendingUp },
    { label: "Closed", value: stageCount("closed"), icon: CheckCircle2 },
  ];
  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
        <PageHeader title="Dashboard" description="Your outreach at a glance."
          action={<Button asChild><Link to="/contacts">View all contacts <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>} />
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-5 shadow-elegant">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                    <s.icon className="h-4 w-4 text-gold-dark" />
                  </div>
                  <div className="text-3xl font-bold mt-2">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-elegant">
                <h3 className="font-bold mb-4">Pipeline distribution</h3>
                <div className="space-y-3">
                  {PIPELINE_STAGES.map((stage) => {
                    const n = stageCount(stage.value);
                    const pct = contacts.length ? (n / contacts.length) * 100 : 0;
                    return (
                      <div key={stage.value}>
                        <div className="flex justify-between text-sm mb-1">
                          <StageBadge stage={stage.value} />
                          <span className="font-medium">{n}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: `hsl(var(--${stage.color}))` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-6 shadow-elegant">
                <h3 className="font-bold mb-4">Recent activity</h3>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {activities.map((a) => (
                      <li key={a.id} className="text-sm">
                        <div className="text-foreground">{a.description}</div>
                        <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
