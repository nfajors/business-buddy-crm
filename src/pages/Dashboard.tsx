import { Link } from "react-router-dom";
import { Users, TrendingUp, MessageCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PIPELINE_STAGES } from "@/lib/types";
import { useDashboardStats, useRecentActivities } from "@/lib/queries";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useDashboardStats();
  const { data: activities = [] } = useRecentActivities(8);
  const loading = loadingStats;
  const total = stats?.total ?? 0;
  const byStage = stats?.byStage ?? { new: 0, contacted: 0, responded: 0, meeting: 0, closed: 0 };
  const tiles = [
    { label: "Total contacts", value: total, icon: Users },
    { label: "Contacted", value: byStage.contacted, icon: MessageCircle },
    { label: "Responded", value: byStage.responded, icon: TrendingUp },
    { label: "Closed", value: byStage.closed, icon: CheckCircle2 },
  ];
  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
        <PageHeader title="Dashboard" description="Your outreach at a glance."
          action={<Button asChild><Link to="/contacts">View all contacts <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>} />
        {loading ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-elegant">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16 mt-3" />
                </div>
              ))}
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-elegant space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-8" /></div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
              <div className="bg-card border border-border rounded-xl p-6 shadow-elegant space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {tiles.map((s) => (
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
                    const n = byStage[stage.value];
                    const pct = total ? (n / total) * 100 : 0;
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
