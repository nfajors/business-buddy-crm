import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Search, Users, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { NewContactDialog } from "@/components/NewContactDialog";
import { useContacts, useIndustries } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

const PAGE_SIZE = 50;

export default function Contacts() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(params.get("stage") ?? "all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [openNew, setOpenNew] = useState(false);

  // Keep ?stage= in sync so links from the pipeline land filtered.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (stageFilter === "all") next.delete("stage");
    else next.set("stage", stageFilter);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, stageFilter, industryFilter]);

  const { data, isLoading, isFetching } = useContacts({
    search: debouncedSearch,
    stage: stageFilter as PipelineStage | "all",
    industry: industryFilter,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: industries = [] } = useIndustries();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE + rows.length);

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Contacts"
          description={total === 0 ? "No contacts yet" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          action={<Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New contact</Button>}
        />
        <div className="bg-card border border-border rounded-xl shadow-elegant overflow-hidden">
          <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, company, email, phone, city…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} title="No contacts found" description="Try adjusting your search or filters, or add a new contact."
              action={<Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New contact</Button>} />
          ) : (
            <div className="overflow-x-auto relative">
              {isFetching && (
                <div className="absolute right-3 top-3 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating
                </div>
              )}
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
                  {rows.map((c) => (
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
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
                <span className="text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <NewContactDialog open={openNew} onOpenChange={setOpenNew} onCreated={() => { setPage(0); qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); qc.invalidateQueries({ queryKey: ["pipeline"] }); }} />
    </AppLayout>
  );
}
