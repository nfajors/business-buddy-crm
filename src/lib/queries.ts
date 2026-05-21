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
import { buildSearchBlob } from "@/lib/audit";

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

// Contact-list pagination ceiling. Matches the existing STATS_* and
// PIPELINE_* workarounds for the same proxy bug (#23 / #32): we scan the
// table client-side because the ZeroDB proxy ignores `filter` and does
// only prefix-match on `search`. Bump if the table grows past 10k.
const CONTACTS_LIST_PAGE_SIZE = 500;
const CONTACTS_LIST_MAX_PAGES = 20; // 10,000-row ceiling.

function compareContacts(a: Contact, b: Contact, sort: ContactSort, asc: boolean): number {
  const dir = asc ? 1 : -1;
  const av = (a[sort] ?? "") as string;
  const bv = (b[sort] ?? "") as string;
  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return 0;
}

function contactMatchesSearch(c: Contact, needle: string): boolean {
  // Prefer the stored search_blob, but recompute from the row's fields if
  // it's empty (older rows pre-#7, or any row where the trigger didn't
  // run). Substring + case-insensitive.
  const blob = (c.search_blob && c.search_blob.length > 0)
    ? c.search_blob.toLowerCase()
    : buildSearchBlob({
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        company: c.company,
        title: c.title,
        city: c.city,
        tags: c.tags ?? [],
      });
  return blob.includes(needle);
}

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
      // The ZeroDB proxy ignores `filter` (#23) and only does prefix-match
      // on `search` (#32 — "Zimmerman" never matches "scott zimmerman …").
      // Workaround: paginate the unfiltered table, then filter/search/sort
      // client-side. Same pattern as useDashboardStats / usePipeline.
      const needle = search.trim().toLowerCase();
      const all: Contact[] = [];
      for (let p = 0; p < CONTACTS_LIST_MAX_PAGES; p++) {
        const res = await zerodb.tables.query("contacts", {
          limit: CONTACTS_LIST_PAGE_SIZE,
          offset: p * CONTACTS_LIST_PAGE_SIZE,
        });
        if (res.records.length === 0) break;
        all.push(...res.records);
        if (res.records.length < CONTACTS_LIST_PAGE_SIZE) break;
      }

      const filtered = all.filter((c) => {
        if (stage !== "all" && c.pipeline_stage !== stage) return false;
        if (industry !== "all" && c.industry !== industry) return false;
        if (needle && !contactMatchesSearch(c, needle)) return false;
        return true;
      });
      filtered.sort((a, b) => compareContacts(a, b, sort, ascending));

      const start = page * pageSize;
      return { rows: filtered.slice(start, start + pageSize), total: filtered.length };
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
// Profile lookup. Profile rows are keyed by ZeroDB's auto row_id, so
// we look the row up by scanning. The proxy still ignores the `filter`
// param (#23), so we paginate and match client-side.
//
// We match on BOTH `r.id` and `r.user_id`. The `user_id` field isn't
// declared in the profiles bootstrap schema, so the proxy may drop it
// (#34); the save path mirrors the email into `id` inside `row_data` as
// a belt-and-suspenders, so a row written with `{ id: email, user_id: email }`
// stays findable even if `user_id` is silently stripped.
//
// We page through up to 1,000 rows so accumulated duplicates from earlier
// orphan-saves can't hide the real one.
const PROFILE_SCAN_PAGE_SIZE = 200;
const PROFILE_SCAN_MAX_PAGES = 5;

export async function findProfileByUserId(userId: string): Promise<Profile | null> {
  let mostRecent: Profile | null = null;
  for (let p = 0; p < PROFILE_SCAN_MAX_PAGES; p++) {
    const res = await zerodb.tables.query("profiles", {
      limit: PROFILE_SCAN_PAGE_SIZE,
      offset: p * PROFILE_SCAN_PAGE_SIZE,
      sort: [{ field: "updated_at", direction: "desc" }],
    });
    for (const r of res.records) {
      // Match either key. `user_id` is preferred but may be absent for
      // rows written before the schema fix; `id`-in-row_data is the
      // belt-and-suspenders fallback.
      const matches = r.user_id === userId || (r as { id?: string }).id === userId;
      if (matches) {
        // Keep the most recently-updated match. Since results are sorted
        // updated_at DESC server-side (when the proxy honours it) the
        // first hit is usually right, but we still compare timestamps
        // client-side in case sort was ignored.
        if (
          !mostRecent ||
          (r.updated_at ?? "") > (mostRecent.updated_at ?? "")
        ) {
          mostRecent = r as Profile;
        }
      }
    }
    if (res.records.length < PROFILE_SCAN_PAGE_SIZE) break;
  }
  return mostRecent;
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
