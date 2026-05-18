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
      // Replaces the Supabase `get_dashboard_stats` RPC. Tables API has no
      // RPC, so the real total comes from a single unfiltered count, and the
      // per-stage breakdown fans out 5 filtered counts. Contacts have exactly
      // one pipeline_stage, so the stage buckets partition the population —
      // total is NOT the sum of buckets (that was the source of #22's 5× error).
      const stages: PipelineStage[] = PIPELINE_STAGES.map((s) => s.value);
      const [total, ...counts] = await Promise.all([
        zerodb.tables.count("contacts", {}),
        ...stages.map((stage) => zerodb.tables.count("contacts", { pipeline_stage: stage })),
      ]);

      const byStage = {} as Record<PipelineStage, number>;
      // Defensive: if every per-stage count equals the unfiltered total, the
      // upstream proxy is ignoring the `filter` param (see #23). Don't show a
      // wildly misleading breakdown — collapse to "new" (the import default)
      // and zero the rest. Self-heals automatically once #23 is fixed.
      const filterIgnored =
        total > 0 && counts.every((c) => c === total);
      if (filterIgnored) {
        console.warn(
          "[dashboard-stats] proxy filter appears to be ignored (every stage count == total). " +
            "Falling back to single-bucket display. See issue #23.",
        );
        stages.forEach((stage) => {
          byStage[stage] = stage === "new" ? total : 0;
        });
      } else {
        stages.forEach((stage, i) => {
          byStage[stage] = counts[i];
        });
      }
      return { total, byStage };
    },
    staleTime: 30_000,
  });
}

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
      const stages = PIPELINE_STAGES.map((s) => s.value);
      const results = await Promise.all(
        stages.map((stage) =>
          zerodb.tables.query("contacts", {
            filter: { pipeline_stage: stage },
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: PIPELINE_CAP,
          }),
        ),
      );
      const map = {} as Record<PipelineStage, PipelineCard[]>;
      stages.forEach((stage, i) => {
        map[stage] = results[i].records as PipelineCard[];
      });
      return map;
    },
    staleTime: 15_000,
  });
}

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
