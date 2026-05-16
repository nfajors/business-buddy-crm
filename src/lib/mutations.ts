import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ContactInsert, ContactUpdate, PipelineStage } from "@/lib/types";

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