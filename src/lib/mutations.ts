import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ContactInsert, ContactUpdate, PipelineStage, TaskInsert, TaskStatus, TaskUpdate } from "@/lib/types";

function invalidateContactLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["contacts", "list"] });
  qc.invalidateQueries({ queryKey: ["pipeline"] });
  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInsert) => {
      const { data, error } = await supabase.from("contacts").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Contact created");
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ContactUpdate) => {
      const { data, error } = await supabase
        .from("contacts")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Contact updated");
      qc.invalidateQueries({ queryKey: ["contact", id] });
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success("Contact deleted");
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Optimistic stage update with rollback (item 6).
export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: PipelineStage }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ pipeline_stage: stage })
        .eq("id", id);
      if (error) throw error;
      return { id, stage };
    },
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["pipeline"] });
      const previous = qc.getQueryData(["pipeline"]);
      qc.setQueryData<Record<PipelineStage, Array<{ id: string; pipeline_stage: PipelineStage }>>>(
        ["pipeline"],
        (old) => {
          if (!old) return old;
          const next = { ...old } as typeof old;
          let moving: (typeof old)[PipelineStage][number] | undefined;
          for (const key of Object.keys(next) as PipelineStage[]) {
            const idx = next[key].findIndex((c) => c.id === id);
            if (idx >= 0) {
              moving = { ...next[key][idx], pipeline_stage: stage };
              next[key] = [...next[key].slice(0, idx), ...next[key].slice(idx + 1)];
              break;
            }
          }
          if (moving) next[stage] = [moving, ...(next[stage] ?? [])];
          return next;
        },
      );
      // Update detail cache too if it's loaded.
      const prevContact = qc.getQueryData<Record<string, unknown>>(["contact", id]);
      if (prevContact) {
        qc.setQueryData(["contact", id], { ...prevContact, pipeline_stage: stage });
      }
      return { previous, prevContact };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["pipeline"], ctx.previous);
      if (ctx?.prevContact && _vars?.id) qc.setQueryData(["contact", _vars.id], ctx.prevContact);
      toast.error(e.message || "Could not move contact");
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (vars?.id) qc.invalidateQueries({ queryKey: ["contact", vars.id] });
    },
  });
}

export function useAddNote(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, authorId }: { content: string; authorId: string }) => {
      const { data, error } = await supabase
        .from("notes")
        .insert({ contact_id: contactId, author_id: authorId, content })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Note added");
      qc.invalidateQueries({ queryKey: ["notes", contactId] });
      qc.invalidateQueries({ queryKey: ["activities", contactId] });
      qc.invalidateQueries({ queryKey: ["activities", "recent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Bulk contact actions ----------

export function useBulkUpdateContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: ContactUpdate }) => {
      if (ids.length === 0) return 0;
      const { error, count } = await supabase
        .from("contacts")
        .update(patch, { count: "exact" })
        .in("id", ids);
      if (error) throw error;
      return count ?? ids.length;
    },
    onSuccess: (count) => {
      toast.success(`Updated ${count} contact${count === 1 ? "" : "s"}`);
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkDeleteContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { error, count } = await supabase
        .from("contacts")
        .delete({ count: "exact" })
        .in("id", ids);
      if (error) throw error;
      return count ?? ids.length;
    },
    onSuccess: (count) => {
      toast.success(`Deleted ${count} contact${count === 1 ? "" : "s"}`);
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkAddTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, tag }: { ids: string[]; tag: string }) => {
      const cleaned = tag.trim();
      if (!cleaned || ids.length === 0) return 0;
      // Fetch existing tags then merge — small N expected from selection.
      const { data, error } = await supabase.from("contacts").select("id, tags").in("id", ids);
      if (error) throw error;
      await Promise.all(
        (data ?? []).map((row) => {
          const next = Array.from(new Set([...(row.tags ?? []), cleaned]));
          return supabase.from("contacts").update({ tags: next }).eq("id", row.id);
        }),
      );
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`Tagged ${count} contact${count === 1 ? "" : "s"}`);
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Single-contact tag editing ----------

export function useUpdateContactTags(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tags: string[]) => {
      const cleaned = Array.from(
        new Set(tags.map((t) => t.trim()).filter(Boolean)),
      ).slice(0, 30);
      const { data, error } = await supabase
        .from("contacts")
        .update({ tags: cleaned })
        .eq("id", contactId)
        .select("id, tags")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contacts", "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ContactInsert[]) => {
      if (rows.length === 0) return { inserted: 0, failed: 0 };
      // Chunk to keep payloads small + isolate row-level errors.
      const CHUNK = 200;
      let inserted = 0;
      let failed = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error, count } = await supabase.from("contacts").insert(slice, { count: "exact" });
        if (error) {
          failed += slice.length;
        } else {
          inserted += count ?? slice.length;
        }
      }
      return { inserted, failed };
    },
    onSuccess: ({ inserted, failed }) => {
      if (inserted) toast.success(`Imported ${inserted} contact${inserted === 1 ? "" : "s"}`);
      if (failed) toast.error(`${failed} row${failed === 1 ? "" : "s"} failed (duplicates or invalid email)`);
      invalidateContactLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Tasks ----------

function invalidateTasks(qc: ReturnType<typeof useQueryClient>, contactId?: string | null) {
  qc.invalidateQueries({ queryKey: ["tasks"] });
  if (contactId) qc.invalidateQueries({ queryKey: ["activities", contactId] });
  qc.invalidateQueries({ queryKey: ["activities", "recent"] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInsert) => {
      const { data, error } = await supabase.from("tasks").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Task created");
      invalidateTasks(qc, data?.contact_id ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskUpdate }) => {
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateTasks(qc, data?.contact_id ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, userId }: { id: string; status: TaskStatus; userId?: string }) => {
      const patch: TaskUpdate = {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
        completed_by: status === "done" ? userId ?? null : null,
      };
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateTasks(qc, data?.contact_id ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; contactId?: string | null }) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Task deleted");
      invalidateTasks(qc, vars.contactId ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}