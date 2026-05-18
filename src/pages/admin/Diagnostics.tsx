import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { zerodb } from "@/integrations/zerodb/client";
import type { Contact } from "@/integrations/zerodb/types";

// Admin-only diagnostic for tracing where contacts came from.
// Surfaces (1) the oldest 20 contacts so we can spot pre-existing seed/test
// data, and (2) a per-day histogram of created_at so import bursts are
// visible at a glance.
// Built ad-hoc for the "DB has 1,203 more contacts than the CSV" question
// after #22/#23. Not linked into the main nav — admins reach it via Settings.

const SCAN_PAGE_SIZE = 200;
const SCAN_MAX_PAGES = 50; // 10k row ceiling.

type DiagSnapshot = {
  total: number;
  scanned: number;
  oldest: Contact[];
  byDay: { day: string; count: number }[];
  truncated: boolean;
};

async function loadDiagnostic(): Promise<DiagSnapshot> {
  const total = await zerodb.tables.count("contacts", {});
  const all: Contact[] = [];
  for (let page = 0; page < SCAN_MAX_PAGES; page++) {
    const res = await zerodb.tables.query("contacts", {
      limit: SCAN_PAGE_SIZE,
      offset: page * SCAN_PAGE_SIZE,
    });
    if (res.records.length === 0) break;
    all.push(...res.records);
    if (res.records.length < SCAN_PAGE_SIZE) break;
  }

  const sorted = [...all].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  const oldest = sorted.slice(0, 20);

  const buckets = new Map<string, number>();
  for (const c of all) {
    if (!c.created_at) continue;
    const day = c.created_at.slice(0, 10); // YYYY-MM-DD
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  const byDay = Array.from(buckets.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return { total, scanned: all.length, oldest, byDay, truncated: all.length < total };
}

export default function Diagnostics() {
  const { isAdmin, loading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-diagnostics", "contacts"],
    queryFn: loadDiagnostic,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const maxDay = data?.byDay.reduce((m, b) => Math.max(m, b.count), 0) ?? 0;

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto space-y-6">
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to settings
        </Link>
        <PageHeader title="Contact diagnostics" description="Admin-only. Trace where contacts in the DB came from." />

        {isLoading || !data ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : (
          <>
            <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-bold">Totals</h3>
                {data.truncated && (
                  <span className="text-xs text-destructive">Scan capped at {data.scanned.toLocaleString()} of {data.total.toLocaleString()}.</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <Stat label="Total contacts (DB)" value={data.total.toLocaleString()} />
                <Stat label="Scanned for analysis" value={data.scanned.toLocaleString()} />
                <Stat label="Distinct created-at days" value={data.byDay.length.toLocaleString()} />
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
              <h3 className="font-bold mb-4">Oldest 20 contacts</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Sorted by <code>created_at</code> ascending. Imports show up here as bursts;
                pre-existing seed/manual data shows up as scattered older rows.
              </p>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Created</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Stage</th>
                      <th className="py-2 pr-3">Created by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.oldest.map((c) => (
                      <tr key={c.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <div>{c.created_at ? format(parseISO(c.created_at), "yyyy-MM-dd HH:mm") : "—"}</div>
                          <div className="text-xs text-muted-foreground">{c.created_at ? formatDistanceToNowStrict(parseISO(c.created_at), { addSuffix: true }) : ""}</div>
                        </td>
                        <td className="py-2 pr-3">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                        <td className="py-2 pr-3">{c.company || "—"}</td>
                        <td className="py-2 pr-3 break-all">{c.email || "—"}</td>
                        <td className="py-2 pr-3">{c.pipeline_stage}</td>
                        <td className="py-2 pr-3 break-all">{c.created_by || "—"}</td>
                      </tr>
                    ))}
                    {data.oldest.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No contacts in the DB.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-6 shadow-elegant">
              <h3 className="font-bold mb-4">Contacts created per day</h3>
              <p className="text-xs text-muted-foreground mb-3">
                A single tall bar = one big import. Scattered low bars = manual/incidental creates.
              </p>
              <div className="space-y-1.5">
                {data.byDay.map((b) => (
                  <div key={b.day} className="flex items-center gap-3 text-sm">
                    <div className="w-28 text-muted-foreground font-mono text-xs">{b.day}</div>
                    <div className="flex-1 bg-secondary rounded h-5 relative overflow-hidden">
                      <div
                        className="h-full bg-gold"
                        style={{ width: `${maxDay > 0 ? (b.count / maxDay) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="w-16 text-right tabular-nums">{b.count.toLocaleString()}</div>
                  </div>
                ))}
                {data.byDay.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No rows with created_at to bucket.</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
