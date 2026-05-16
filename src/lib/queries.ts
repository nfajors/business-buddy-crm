import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Activity, Contact, Note, PipelineStage, Task, TaskStatus } from "@/lib/types";
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
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (error) throw error;
      const row = data?.[0] ?? {
        total: 0,
        new_count: 0,
        contacted_count: 0,
        responded_count: 0,
        meeting_count: 0,
        closed_count: 0,
      };
      return {
        total: Number(row.total),
        byStage: {
          new: Number(row.new_count),
          contacted: Number(row.contacted_count),
          responded: Number(row.responded_count),
          meeting: Number(row.meeting_count),
          closed: Number(row.closed_count),
        },
      };
    },
    staleTime: 30_000,
  });
}

export function useRecentActivities(limit = 8) {
  return useQuery({
    queryKey: ["activities", "recent", limit],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

// ---------- Contacts list (server-side search + pagination) ----------

export type ContactSort = "created_at" | "updated_at" | "first_name" | "company";

export type ContactsQueryArgs = {
  search?: string;
  stage?: PipelineStage | "all";
  industry?: string | "all";
  sort?: ContactSort;
  ascending?: boolean;
  page?: number; // 0-based
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
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .order(sort, { ascending });

      if (stage !== "all") q = q.eq("pipeline_stage", stage);
      if (industry !== "all") q = q.eq("industry", industry);

      const s = search.trim();
      if (s) {
        // Prefer full-text on the indexed tsvector. For single-token searches
        // append :* for prefix matches ("ali" → matches "Alice"). For multi-
        // token searches let websearch_to_tsquery handle quoting + boolean.
        const tokens = s.split(/\s+/).filter(Boolean);
        if (tokens.length === 1 && !/[:&|!()"']/.test(tokens[0])) {
          // Prefix match on a single token via raw tsquery operator.
          q = q.filter("search_tsv", "fts", `${tokens[0]}:*`);
        } else {
          q = q.textSearch("search_tsv", s, { type: "websearch" });
        }
      }

      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    staleTime: 15_000,
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ["contacts", "industries"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("industry")
        .not("industry", "is", null)
        .limit(1000);
      if (error) throw error;
      return Array.from(
        new Set((data ?? []).map((r) => r.industry).filter((v): v is string => !!v)),
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
          supabase
            .from("contacts")
            .select("id, first_name, last_name, title, company, pipeline_stage, updated_at")
            .eq("pipeline_stage", stage)
            .order("updated_at", { ascending: false })
            .limit(PIPELINE_CAP),
        ),
      );
      const map = {} as Record<PipelineStage, PipelineCard[]>;
      stages.forEach((stage, i) => {
        map[stage] = (results[i].data ?? []) as PipelineCard[];
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
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useContactNotes(contactId: string | undefined) {
  return useQuery({
    queryKey: ["notes", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContactActivities(contactId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ["activities", contactId, limit],
    enabled: !!contactId,
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
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
      let q = supabase.from("tasks").select("*");
      if (contactId) q = q.eq("contact_id", contactId);
      if (status !== "all") q = q.eq("status", status);
      if (assignee === "me" && currentUserId) q = q.eq("assignee_id", currentUserId);
      else if (assignee !== "all" && assignee !== "me") q = q.eq("assignee_id", assignee);
      q = q.order("status", { ascending: true }).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}