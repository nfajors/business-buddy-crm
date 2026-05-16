// Audit + timestamp helpers. Replaces the Postgres triggers
// (`contacts_after_insert`, `contacts_after_stage_change`,
// `notes_after_insert`, `tasks_after_insert`, `tasks_after_complete`,
// `set_updated_at`) that the ZeroDB migration drops (#7).
//
// Trade-off, captured in #7's body: these writes are best-effort, not
// transactional. A failed activity insert is logged and swallowed; the
// primary write does not roll back. Centralizing here keeps the call sites
// honest — one place to grep when audit fidelity drifts.

import { zerodb } from "@/integrations/zerodb/client";
import type {
  ActivityType,
  Contact,
  ContactInsert,
  ContactUpdate,
  Json,
  PipelineStage,
} from "@/integrations/zerodb/types";

export function currentUserId(): string | null {
  return zerodb.getSession()?.user.id ?? null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Lowercased denormalized search field. Replaces the Postgres
// `search_tsv` GENERATED column; rebuilt on every contact write.
export function buildSearchBlob(c: Pick<Contact,
  "first_name" | "last_name" | "email" | "company" | "title" | "city" | "tags"
> & { tags?: string[] | null }): string {
  return [
    c.first_name,
    c.last_name,
    c.email,
    c.company,
    c.title,
    c.city,
    ...(c.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function stampForInsert<T extends object>(input: T): T & {
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
} {
  const now = nowIso();
  const uid = currentUserId();
  return {
    created_by: uid,
    updated_by: uid,
    ...input,
    created_at: now,
    updated_at: now,
  };
}

export function stampForUpdate<T extends object>(input: T): T & {
  updated_at: string;
  updated_by: string | null;
} {
  return {
    ...input,
    updated_at: nowIso(),
    updated_by: currentUserId(),
  };
}

export function stampContactForInsert(input: Partial<ContactInsert>): ContactInsert {
  const stamped = stampForInsert(input);
  return {
    ...stamped,
    first_name: stamped.first_name ?? "",
    company: stamped.company ?? "",
    pipeline_stage: stamped.pipeline_stage ?? "new",
    tags: stamped.tags ?? [],
    search_blob: buildSearchBlob({
      first_name: stamped.first_name ?? "",
      last_name: stamped.last_name ?? null,
      email: stamped.email ?? null,
      company: stamped.company ?? "",
      title: stamped.title ?? null,
      city: stamped.city ?? null,
      tags: stamped.tags ?? [],
    }),
  } as ContactInsert;
}

export function stampContactForUpdate(
  patch: ContactUpdate,
  existing?: Contact | null,
): ContactUpdate {
  const stamped = stampForUpdate(patch);
  if (!existing) return stamped;
  // Recompute search_blob if any of the source fields changed.
  const merged: Pick<Contact, "first_name" | "last_name" | "email" | "company" | "title" | "city" | "tags"> = {
    first_name: patch.first_name ?? existing.first_name,
    last_name: patch.last_name !== undefined ? patch.last_name : existing.last_name,
    email: patch.email !== undefined ? patch.email : existing.email,
    company: patch.company ?? existing.company,
    title: patch.title !== undefined ? patch.title : existing.title,
    city: patch.city !== undefined ? patch.city : existing.city,
    tags: patch.tags ?? existing.tags,
  };
  return { ...stamped, search_blob: buildSearchBlob(merged) };
}

interface ActivityInput {
  contact_id: string;
  type: ActivityType;
  description: string;
  metadata?: Json;
}

// Fire-and-log: never throws. The primary write must not be reverted on
// audit failure. If you find yourself wanting transactional behavior,
// the right answer is a server-side hook on ZeroDB, not retry logic here.
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await zerodb.tables.insert("activities", {
      contact_id: input.contact_id,
      type: input.type,
      description: input.description,
      actor_id: currentUserId(),
      metadata: (input.metadata ?? {}) as Json,
      created_at: nowIso(),
    });
    await touchContactActivity(input.contact_id);
  } catch (err) {
    console.warn("[audit] activity write failed", { input, err });
  }
}

async function touchContactActivity(contactId: string): Promise<void> {
  try {
    await zerodb.tables.update("contacts", contactId, {
      last_activity_at: nowIso(),
    });
  } catch (err) {
    console.warn("[audit] last_activity_at update failed", { contactId, err });
  }
}

export const stageChangeDescription = (next: PipelineStage): string =>
  `Stage changed to ${next}`;
