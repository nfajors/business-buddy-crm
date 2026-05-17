import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Search, Users, Plus, ChevronLeft, ChevronRight, Download, Upload, Tag, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { NewContactDialog } from "@/components/NewContactDialog";
import { ImportContactsDialog } from "@/components/ImportContactsDialog";
import { useContacts, useIndustries, type ContactSort } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useBulkAddTag, useBulkDeleteContacts, useBulkUpdateContacts } from "@/lib/mutations";
import { contactsToCsv, downloadCsv } from "@/lib/csv";
import { zerodb } from "@/integrations/zerodb/client";
import type { Contact } from "@/lib/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  const [openImport, setOpenImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<ContactSort>("created_at");
  const [ascending, setAscending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const bulkUpdate = useBulkUpdateContacts();
  const bulkDelete = useBulkDeleteContacts();
  const bulkTag = useBulkAddTag();

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
    setSelected(new Set());
  }, [debouncedSearch, stageFilter, industryFilter, sort, ascending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isLoading, isFetching } = useContacts({
    search: debouncedSearch,
    stage: stageFilter as PipelineStage | "all",
    industry: industryFilter,
    sort,
    ascending,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: industries = [] } = useIndustries();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE + rows.length);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOnPageSelected = rows.some((r) => selected.has(r.id));

  const togglePage = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) rows.forEach((r) => next.add(r.id));
      else rows.forEach((r) => next.delete(r.id));
      return next;
    });
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const toggleSort = (col: ContactSort) => {
    if (sort === col) setAscending((a) => !a);
    else { setSort(col); setAscending(col === "first_name" || col === "company"); }
  };
  const SortIcon = ({ col }: { col: ContactSort }) =>
    sort !== col ? <ArrowUpDown className="h-3 w-3 opacity-40 inline ml-1" />
      : ascending ? <ArrowUp className="h-3 w-3 inline ml-1" />
      : <ArrowDown className="h-3 w-3 inline ml-1" />;

  const exportCsv = async () => {
    setExporting(true);
    try {
      let rows: Contact[] = [];
      let truncated = false;

      if (selectedIds.length > 0) {
        // Concurrency cap + per-row tolerance: a single deleted/blipped contact
        // should not abort an export of dozens of rows.
        const CONCURRENCY = 8;
        const fetched: (Contact | null)[] = new Array(selectedIds.length).fill(null);
        const failures: { id: string; reason: string }[] = [];
        let cursor = 0;
        const worker = async () => {
          while (cursor < selectedIds.length) {
            const idx = cursor++;
            const id = selectedIds[idx];
            try {
              fetched[idx] = await zerodb.tables.get("contacts", id);
            } catch (err) {
              failures.push({ id, reason: (err as Error).message });
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, selectedIds.length) }, () => worker()),
        );
        rows = fetched.filter((r): r is Contact => r !== null);
        if (failures.length > 0) {
          toast.error(
            `${failures.length} of ${selectedIds.length} contacts could not be exported (${failures[0].reason})`,
          );
        }
      } else {
        const filter: Record<string, unknown> = {};
        if (stageFilter !== "all") filter.pipeline_stage = stageFilter as PipelineStage;
        if (industryFilter !== "all") filter.industry = industryFilter;
        const s = debouncedSearch.trim().toLowerCase();

        // Page through results instead of a fixed 10k cap so large bases
        // export in full (or surface a truncation warning if we hit the
        // safety ceiling). PAGE_LIMIT is per request; HARD_MAX bounds the
        // total to keep memory and download size predictable.
        const PAGE_LIMIT = 500;
        const HARD_MAX = 50_000;
        let offset = 0;
        let total = Infinity;
        while (rows.length < total && rows.length < HARD_MAX) {
          const res = await zerodb.tables.query("contacts", {
            filter,
            search: s ? { field: "search_blob", value: s } : undefined,
            sort: [{ field: "created_at", direction: "desc" }],
            limit: PAGE_LIMIT,
            offset,
          });
          total = res.total ?? rows.length + res.records.length;
          rows = rows.concat(res.records);
          if (res.records.length < PAGE_LIMIT) break;
          offset += PAGE_LIMIT;
        }
        if (total > rows.length) {
          truncated = true;
          toast.warning(
            `Export truncated to ${rows.length.toLocaleString()} rows (matching ${total.toLocaleString()}). Narrow your filters to export the rest.`,
          );
        }
      }

      if (rows.length === 0) {
        toast.message("No contacts to export.");
        return;
      }

      const csv = contactsToCsv(rows);
      const label = selectedIds.length > 0 ? `contacts-selected-${selectedIds.length}` : "contacts";
      downloadCsv(`${label}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (!truncated && selectedIds.length === 0) {
        toast.success(`Exported ${rows.length.toLocaleString()} contact${rows.length === 1 ? "" : "s"}`);
      }
    } catch (e) {
      toast.error((e as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Contacts"
          description={total === 0 ? "No contacts yet" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportCsv} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => setOpenImport(true)}>
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New contact</Button>
            </div>
          }
        />
        {selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 p-3 bg-secondary/60 border border-border rounded-lg">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <Select onValueChange={(v) => bulkUpdate.mutate({ ids: selectedIds, patch: { pipeline_stage: v as PipelineStage } }, { onSuccess: clearSelection })}>
              <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Move to stage…" /></SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag…"
                className="h-8 w-32"
              />
              <Button size="sm" variant="outline" disabled={!tagInput.trim() || bulkTag.isPending}
                onClick={() => bulkTag.mutate({ ids: selectedIds, tag: tagInput }, { onSuccess: () => { setTagInput(""); clearSelection(); } })}>
                <Tag className="h-4 w-4 mr-1" /> Apply
              </Button>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.length} contact{selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the selected contacts, their notes and tasks. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => bulkDelete.mutate(selectedIds, { onSuccess: clearSelection })}
                    className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="ml-auto">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          </div>
        )}
        <div className="bg-card border border-border rounded-xl shadow-elegant overflow-hidden">
          <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={searchRef} placeholder='Search name, company, email, city…  ( press "/" )' value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1 max-w-[26%]" />
                  <Skeleton className="h-4 flex-1 max-w-[22%] hidden md:block" />
                  <Skeleton className="h-4 flex-1 max-w-[20%]" />
                  <Skeleton className="h-4 w-24 hidden lg:block" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
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
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <Checkbox
                        checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                        onCheckedChange={(v) => togglePage(!!v)}
                        aria-label="Select page"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <button type="button" onClick={() => toggleSort("first_name")} className="inline-flex items-center hover:text-foreground">
                        Name <SortIcon col="first_name" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Title</th>
                    <th className="px-4 py-3 font-semibold">
                      <button type="button" onClick={() => toggleSort("company")} className="inline-flex items-center hover:text-foreground">
                        Company <SortIcon col="company" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">
                      <button type="button" onClick={() => toggleSort("updated_at")} className="inline-flex items-center hover:text-foreground">
                        Updated <SortIcon col="updated_at" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((c) => (
                    <tr key={c.id} className={`hover:bg-secondary/40 transition-smooth ${selected.has(c.id) ? "bg-secondary/40" : ""}`}>
                      <td className="px-3 py-3 w-10">
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={(v) => toggleOne(c.id, !!v)}
                          aria-label={`Select ${c.first_name} ${c.last_name ?? ""}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/contacts/${c.id}`} className="font-semibold text-foreground hover:text-gold-dark">
                          {c.first_name} {c.last_name}
                        </Link>
                        <div className="text-xs text-muted-foreground md:hidden">{c.title}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.title}</td>
                      <td className="px-4 py-3">{c.company}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {c.updated_at ? formatDistanceToNow(new Date(c.updated_at), { addSuffix: true }) : "—"}
                      </td>
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
      <ImportContactsDialog open={openImport} onOpenChange={setOpenImport} />
    </AppLayout>
  );
}
