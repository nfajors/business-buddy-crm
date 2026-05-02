import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Users, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contact, PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { seedContactsIfEmpty } from "@/lib/seed";
import { useAuth } from "@/hooks/useAuth";
import { NewContactDialog } from "@/components/NewContactDialog";

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
    setContacts((data ?? []) as unknown as Contact[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    (async () => { await seedContactsIfEmpty(); await load(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const industries = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.industry).filter(Boolean))).sort(),
    [contacts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (stageFilter !== "all" && c.pipeline_stage !== stageFilter) return false;
      if (industryFilter !== "all" && c.industry !== industryFilter) return false;
      if (!q) return true;
      return (
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q)
      );
    });
  }, [contacts, search, stageFilter, industryFilter]);

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Contacts"
          description={`${filtered.length} of ${contacts.length} contacts`}
          action={<Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New contact</Button>}
        />
        <div className="bg-card border border-border rounded-xl shadow-elegant overflow-hidden">
          <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, company, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {PIPELINE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="md:w-56"><SelectValue placeholder="Industry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                {industries.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="No contacts found" description="Try adjusting your search or filters, or add a new contact."
              action={<Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New contact</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Title</th>
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Location</th>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/40 transition-smooth">
                      <td className="px-4 py-3">
                        <Link to={`/contacts/${c.id}`} className="font-semibold text-foreground hover:text-gold-dark">
                          {c.first_name} {c.last_name}
                        </Link>
                        <div className="text-xs text-muted-foreground md:hidden">{c.title}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.title}</td>
                      <td className="px-4 py-3">{c.company}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{[c.city, c.state].filter(Boolean).join(", ")}</td>
                      <td className="px-4 py-3"><StageBadge stage={c.pipeline_stage as PipelineStage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <NewContactDialog open={openNew} onOpenChange={setOpenNew} onCreated={load} />
    </AppLayout>
  );
}