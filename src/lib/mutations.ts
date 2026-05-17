import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { zerodb } from "@/integrations/zerodb/client";
import { ZeroDBError } from "@/integrations/zerodb/client";
import type {
  Contact,
  ContactInsert,
  ContactUpdate,
  PipelineStage,
  TaskInsert,
  TaskStatus,
  TaskUpdate,
} from "@/integrations/zerodb/types";
import {
  buildSearchBlob,
  currentUserId,
  nowIso,
  recordActivity,
  stageChangeDescription,
  stampContactForInsert,
  stampContactForUpdate,
  stampForInsert,
  stampForUpdate,
} from "@/lib/audit";

function invalidateContactLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["contacts", "list"] });
  qc.invalidateQueries({ queryKey: ["pipeline"] });
  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ContactInsert>) => {
      const data = await zerodb.tables.insert("contacts", stampContactForInsert(input));
      if (data.id) {
        await recordActivity({
          contact_id: data.id,
          type: "created",
          description: "Contact created",
        });
      }
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
      const existing = qc.getQueryData<Contact | null>(["contact", id]) ?? null;
      return zerodb.tables.update("contacts", id, stampContactForUpdate(patch, existing));
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
      await zerodb.tables.remove("contacts", id);
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
      await zerodb.tables.update("contacts", id, stampForUpdate({ pipeline_stage: stage }));
      await recordActivity({
        contact_id: id,
        type: "stage_change",
        description: stageChangeDescription(stage),
        metadata: { to: stage },
      });
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
      const data = await zerodb.tables.insert("notes", {
        contact_id: contactId,
        author_id: authorId,
        content,
        created_at: nowIso(),
      });
      await recordActivity({
        contact_id: contactId,
        type: "note",
        description: content.slice(0, 200),
      });
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
      const stamped = stampForUpdate(patch);
      // No bulk-update endpoint on the Tables API; fan out N requests.
      // Acceptable for small selections (UI caps at one page = 50).
      await Promise.all(ids.map((id) => zerodb.tables.update("contacts", id, stamped)));
      return ids.length;
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
      await Promise.all(ids.map((id) => zerodb.tables.remove("contacts", id)));
      return ids.length;
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
      // Read-modify-write per row to merge tags without dropping existing ones.
      const rows = await Promise.all(ids.map((id) => zerodb.tables.get("contacts", id)));
      await Promise.all(
        rows.map((row) => {
          const next = Array.from(new Set([...(row.tags ?? []), cleaned]));
          return zerodb.tables.update(
            "contacts",
            row.id,
            stampContactForUpdate({ tags: next }, row),
          );
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
      const existing = qc.getQueryData<Contact | null>(["contact", contactId]) ?? null;
      return zerodb.tables.update(
        "contacts",
        contactId,
        stampContactForUpdate({ tags: cleaned }, existing),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contacts", "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface BulkImportResult {
  inserted: number;
  failed: number;
  firstError: string | null;
  // Per-row reasons, capped to keep the payload bounded for the UI.
  errors: { rowIndex: number; reason: string }[];
}

// Concurrency cap for parallel single-row inserts. Tuned for ZeroDB latency:
// high enough to push 3k rows in <2min, low enough to avoid rate-limit spikes.
const IMPORT_CONCURRENCY = 8;
const MAX_REPORTED_ERRORS = 50;

function describeInsertError(err: unknown): string {
  if (err instanceof ZeroDBError) {
    const bodyText =
      typeof err.body === "string"
        ? err.body
        : err.body
          ? JSON.stringify(err.body)
          : "";
    const detail = bodyText.length > 200 ? `${bodyText.slice(0, 200)}…` : bodyText;
    return detail ? `${err.status}: ${detail}` : `HTTP ${err.status}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useBulkImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Partial<ContactInsert>[]): Promise<BulkImportResult> => {
      if (rows.length === 0) return { inserted: 0, failed: 0, firstError: null, errors: [] };

      // Per-row inserts with a concurrency cap. The /rows/bulk endpoint is not
      // reliably available on ZeroDB; sequencing single inserts (which work
      // for manual contact create) is the resilient path. ~8 in flight keeps
      // total time reasonable for thousands of rows without hammering the API.
      const stamped = rows.map(stampContactForInsert);
      let inserted = 0;
      let failed = 0;
      let firstError: string | null = null;
      const errors: BulkImportResult["errors"] = [];

      let cursor = 0;
      async function worker() {
        while (cursor < stamped.length) {
          const idx = cursor++;
          try {
            await zerodb.tables.insert("contacts", stamped[idx]);
            inserted++;
          } catch (err) {
            failed++;
            const reason = describeInsertError(err);
            if (!firstError) firstError = reason;
            if (errors.length < MAX_REPORTED_ERRORS) {
              errors.push({ rowIndex: idx + 1, reason });
            }
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(IMPORT_CONCURRENCY, stamped.length) },
        () => worker(),
      );
      await Promise.all(workers);

      return { inserted, failed, firstError, errors };
    },
    onSuccess: ({ inserted, failed, firstError }) => {
      if (inserted) toast.success(`Imported ${inserted} contact${inserted === 1 ? "" : "s"}`);
      if (failed) {
        const suffix = firstError ? ` — first error: ${firstError}` : "";
        toast.error(`${failed} row${failed === 1 ? "" : "s"} failed${suffix}`);
      }
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
      const stamped = stampForInsert({ ...input, created_by: input.created_by ?? currentUserId() });
      const data = await zerodb.tables.insert("tasks", stamped);
      if (data.contact_id && data.id) {
        await recordActivity({
          contact_id: data.contact_id,
          type: "task_created",
          description: `Task created: ${data.title}`,
          metadata: { task_id: data.id, due_at: data.due_at },
        });
      }
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
      return zerodb.tables.update("tasks", id, stampForUpdate(patch));
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
        completed_at: status === "done" ? nowIso() : null,
        completed_by: status === "done" ? userId ?? currentUserId() : null,
      };
      const data = await zerodb.tables.update("tasks", id, stampForUpdate(patch));
      if (status === "done" && data.contact_id) {
        await recordActivity({
          contact_id: data.contact_id,
          type: "task_completed",
          description: `Task completed: ${data.title}`,
          metadata: { task_id: data.id },
        });
      }
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
      await zerodb.tables.remove("tasks", id);
    },
    onSuccess: (_d, vars) => {
      toast.success("Task deleted");
      invalidateTasks(qc, vars.contactId ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Re-export for back-compat with callers expecting the old buildSearchBlob.
export { buildSearchBlob };
