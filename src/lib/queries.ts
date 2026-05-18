import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { zerodb, ZeroDBError } from "@/integrations/zerodb/client";
import type {
  Activity,
  Contact,
  Note,
  PipelineStage,
  Profile,
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
      // Workaround: get the real total from count() (limit=1, which the
      // proxy handles fine), then paginate the contacts list and
      // partition by pipeline_stage client-side. A single large limit
      // (e.g. 5000) gets dropped silently by the proxy, so we page in
      // safe-sized chunks.
      //
      // Once #23 lands, this can revert to a fan-out of per-stage counts.
      const stages: PipelineStage[] = PIPELINE_STAGES.map((s) => s.value);
      const byStage = {} as Record<PipelineStage, number>;
      stages.forEach((stage) => { byStage[stage] = 0; });

      const total = await zerodb.tables.count("contacts", {});

      let scanned = 0;
      for (let page = 0; page < STATS_MAX_PAGES; page++) {
        const res = await zerodb.tables.query("contacts", {
          limit: STATS_PAGE_SIZE,
          offset: page * STATS_PAGE_SIZE,
        });
        if (res.records.length === 0) break;
        for (const row of res.records) {
          const stage = (row.pipeline_stage ?? "new") as PipelineStage;
          if (stage in byStage) byStage[stage]++;
        }
        scanned += res.records.length;
        if (res.records.length < STATS_PAGE_SIZE) break;
      }

      if (scanned < total) {
        console.warn(
          `[dashboard-stats] DB has ${total} contacts but only ${scanned} ` +
            `were scanned for the per-stage breakdown (cap = ${STATS_MAX_PAGES * STATS_PAGE_SIZE}). ` +
            `Per-stage cards are approximate.`,
        );
      }

      return { total, byStage };
    },
    staleTime: 30_000,
  });
}

// Pagination for the client-side per-stage partition. The proxy rejects
// or silently truncates large limits, so we page in safe chunks.
const STATS_PAGE_SIZE = 200;
const STATS_MAX_PAGES = 50; // 10,000-row ceiling; bump if the table grows.

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
      // Same proxy-filter workaround as useDashboardStats (#23): paginate
      // unfiltered contacts sorted by updated_at desc, partition into
      // stage columns client-side, cap each at PIPELINE_CAP. Stop once
      // every column is full or we hit the page cap.
      const stages = PIPELINE_STAGES.map((s) => s.value);
      const map = {} as Record<PipelineStage, PipelineCard[]>;
      stages.forEach((stage) => { map[stage] = []; });

      for (let page = 0; page < PIPELINE_MAX_PAGES; page++) {
        const res = await zerodb.tables.query("contacts", {
          sort: [{ field: "updated_at", direction: "desc" }],
          limit: PIPELINE_PAGE_SIZE,
          offset: page * PIPELINE_PAGE_SIZE,
        });
        if (res.records.length === 0) break;
        for (const row of res.records) {
          const stage = (row.pipeline_stage ?? "new") as PipelineStage;
          if (map[stage] && map[stage].length < PIPELINE_CAP) {
            map[stage].push(row as PipelineCard);
          }
        }
        if (res.records.length < PIPELINE_PAGE_SIZE) break;
        if (stages.every((s) => map[s].length >= PIPELINE_CAP)) break;
      }
      return map;
    },
    staleTime: 15_000,
  });
}

const PIPELINE_PAGE_SIZE = 200;
const PIPELINE_MAX_PAGES = 25; // 5,000-row scan ceiling.

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

// ---------- Profile ----------

// ZeroDB assigns each row its own UUID row_id; we can't use the user's
// email as a primary key. Instead, profiles carry a `user_id` field and
// we look the row up by scanning. The proxy still ignores the `filter`
// param (#23), so we paginate a small page and match client-side.
// The profiles table only ever has one row per allowlisted user, so a
// single 200-row page is plenty.
export async function findProfileByUserId(userId: string): Promise<Profile | null> {
  const res = await zerodb.tables.query("profiles", {
    limit: 200,
    sort: [{ field: "updated_at", direction: "desc" }],
  });
  const match = res.records.find((r) => r.user_id === userId);
  return (match as Profile | undefined) ?? null;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      try {
        return await findProfileByUserId(userId!);
      } catch (err) {
        if (err instanceof ZeroDBError && (err.status === 404 || err.status === 422)) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}
