import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { zerodb, ZeroDBError } from "@/integrations/zerodb/client";
import type {
  Activity,
  Contact,
  Note,
  PipelineStage,
  Task,
  TaskStatus,
} from "@/integrations/zerodb/types";
import { PIPELINE_STAGES } from "@/lib/types";

// ---------- Dashboard ----------

export type DashboardStats = {
  total: number;
  byStage: Record<PipelineStage, number>;
};

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardStats> => {
      // Per-stage counts via filtered queries are unreliable while the
      // winning-backend proxy ignores the `filter` query param (#23).
      // Workaround: fetch the contacts list once (unfiltered), partition
      // by pipeline_stage client-side. `total` comes from the response's
      // total field which is the unfiltered DB count (this part works).
      //
      // Trade-off: pulls up to STATS_FETCH_CAP rows over the wire on every
      // dashboard refresh. Acceptable while the DB is in the low thousands.
      // Once #23 lands, this can revert to fanned-out per-stage counts.
      const stages: PipelineStage[] = PIPELINE_STAGES.map((s) => s.value);
      const res = await zerodb.tables.query("contacts", { limit: STATS_FETCH_CAP });

      const byStage = {} as Record<PipelineStage, number>;
      stages.forEach((stage) => { byStage[stage] = 0; });
      for (const row of res.records) {
        const stage = (row.pipeline_stage ?? "new") as PipelineStage;
        if (stage in byStage) byStage[stage]++;
      }

      if (res.total > STATS_FETCH_CAP) {
        // We only counted the first page; surface honestly so the math is
        // explainable. The stage breakdown is from the sampled rows; the
        // total card uses the true DB count.
        console.warn(
          `[dashboard-stats] DB has ${res.total} contacts but only the first ` +
            `${STATS_FETCH_CAP} were sampled for the per-stage breakdown. ` +
            `Per-stage cards are approximate. See issue #23.`,
        );
      }

      return { total: res.total, byStage };
    },
    staleTime: 30_000,
  });
}

// Max rows pulled into the dashboard's client-side stage partition.
// Bumped up to whatever the DB realistically holds; revisit if the table
// crosses ~10k rows.
const STATS_FETCH_CAP = 5000;

export function useRecentActivities(limit = 8) {
  return useQuery({
    queryKey: ["activities", "recent", limit],
    queryFn: async (): Promise<Activity[]> => {
      const res = await zerodb.tables.query("activities", {
        sort: [{ field: "created_at", direction: "desc" }],
        limit,
      });
      return res.records;
    },
    staleTime: 30_000,
  });
}

// ---------- Contacts list (server-side filter + pagination, client-side LIKE on search_blob) ----------

export type ContactSort = "created_at" | "updated_at" | "first_name" | "company";

export type ContactsQueryArgs = {
  search?: string;
  stage?: PipelineStage | "all";
  industry?: string | "all";
  sort?: ContactSort;
  ascending?: boolean;
  page?: number;
  pageSize?: number;
};

export type ContactsPage = {
  rows: Contact[];
  total: number;
};

export function useContacts(args: ContactsQueryArgs) {
  const {
    search = "",
    stage = "all",
    industry = "all",
    sort = "created_at",
    ascending = false,
    page = 0,
    pageSize = 50,
  } = args;

  return useQuery({
    queryKey: ["contacts", "list", { search, stage, industry, sort, ascending, page, pageSize }],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ContactsPage> => {
      const filter: Record<string, unknown> = {};
      if (stage !== "all") filter.pipeline_stage = stage;
      if (industry !== "all") filter.industry = industry;

      const s = search.trim().toLowerCase();
      const res = await zerodb.tables.query("contacts", {
        filter,
        // search_blob is the denormalized lowercase concat replacement for
        // Supabase FTS — see scripts/zerodb/bootstrap.ts and audit.ts.
        search: s ? { field: "search_blob", value: s } : undefined,
        sort: [{ field: sort, direction: ascending ? "asc" : "desc" }],
        limit: pageSize,
        offset: page * pageSize,
      });
      return { rows: res.records, total: res.total };
    },
    staleTime: 15_000,
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ["contacts", "industries"],
    queryFn: async (): Promise<string[]> => {
      // No DISTINCT in the Tables API; pull up to 1000 and dedupe.
      const res = await zerodb.tables.query("contacts", { limit: 1000 });
      return Array.from(
        new Set(res.records.map((r) => r.industry).filter((v): v is string => !!v)),
      ).sort();
    },
    staleTime: 5 * 60_000,
  });
}

// ---------- Pipeline ----------

export type PipelineCard = Pick<
  Contact,
  "id" | "first_name" | "last_name" | "title" | "company" | "pipeline_stage" | "updated_at"
>;

const PIPELINE_CAP = 100;

export function usePipeline() {
  return useQuery({
    queryKey: ["pipeline"],
    queryFn: async (): Promise<Record<PipelineStage, PipelineCard[]>> => {
      // Same proxy-filter workaround as useDashboardStats (#23). Pull one
      // unfiltered batch sorted by updated_at desc, then partition into
      // stage columns client-side, capping each at PIPELINE_CAP. This is
      // honest regardless of whether the proxy filters records by stage.
      const stages = PIPELINE_STAGES.map((s) => s.value);
      const res = await zerodb.tables.query("contacts", {
        sort: [{ field: "updated_at", direction: "desc" }],
        limit: PIPELINE_FETCH_CAP,
      });
      const map = {} as Record<PipelineStage, PipelineCard[]>;
      stages.forEach((stage) => { map[stage] = []; });
      for (const row of res.records) {
        const stage = (row.pipeline_stage ?? "new") as PipelineStage;
        if (map[stage] && map[stage].length < PIPELINE_CAP) {
          map[stage].push(row as PipelineCard);
        }
      }
      return map;
    },
    staleTime: 15_000,
  });
}

// Pool we partition into per-stage columns. Big enough that each column
// can plausibly fill to PIPELINE_CAP (100) even when stage distribution
// is uneven. The Tables API is paginated; if the DB grows beyond this,
// switch back to per-stage filtered queries once proxy issue #23 lands.
const PIPELINE_FETCH_CAP = 2000;

export const PIPELINE_COLUMN_CAP = PIPELINE_CAP;

// ---------- Contact detail ----------

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ["contact", id],
    enabled: !!id,
    queryFn: async (): Promise<Contact | null> => {
      try {
        return await zerodb.tables.get("contacts", id!);
      } catch (err) {
        if (err instanceof ZeroDBError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useContactNotes(contactId: string | undefined) {
  return useQuery({
    queryKey: ["notes", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<Note[]> => {
      const res = await zerodb.tables.query("notes", {
        filter: { contact_id: contactId! },
        sort: [{ field: "created_at", direction: "desc" }],
        limit: 500,
      });
      return res.records;
    },
  });
}

export function useContactActivities(contactId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ["activities", contactId, limit],
    enabled: !!contactId,
    queryFn: async (): Promise<Activity[]> => {
      const res = await zerodb.tables.query("activities", {
        filter: { contact_id: contactId! },
        sort: [{ field: "created_at", direction: "desc" }],
        limit,
      });
      return res.records;
    },
  });
}

// ---------- Tasks ----------

export type TasksQueryArgs = {
  contactId?: string;
  status?: TaskStatus | "all";
  assignee?: string | "all" | "me";
  currentUserId?: string;
};

export function useTasks(args: TasksQueryArgs = {}) {
  const { contactId, status = "all", assignee = "all", currentUserId } = args;
  return useQuery({
    queryKey: ["tasks", { contactId: contactId ?? null, status, assignee, currentUserId: currentUserId ?? null }],
    queryFn: async (): Promise<Task[]> => {
      const filter: Record<string, unknown> = {};
      if (contactId) filter.contact_id = contactId;
      if (status !== "all") filter.status = status;
      if (assignee === "me" && currentUserId) filter.assignee_id = currentUserId;
      else if (assignee !== "all" && assignee !== "me") filter.assignee_id = assignee;
      const res = await zerodb.tables.query("tasks", {
        filter,
        sort: [
          { field: "status", direction: "asc" },
          { field: "due_at", direction: "asc" },
          { field: "created_at", direction: "desc" },
        ],
        limit: 500,
      });
      return res.records;
    },
    staleTime: 15_000,
  });
}
