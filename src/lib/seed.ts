import { supabase } from "@/integrations/supabase/client";

// Fetch all rows from a table, paginating past Supabase's 1000-row cap
export async function fetchAllContacts<T = unknown>(orderCol = "created_at"): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order(orderCol, { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    all.push(...(data as unknown as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

let seedAttempted = false;
export async function seedContactsIfEmpty(): Promise<number> {
  if (seedAttempted) return 0;
  seedAttempted = true;
  const { count, error: countErr } = await supabase.from("contacts").select("*", { count: "exact", head: true });
  if (countErr) return 0;
  if ((count ?? 0) > 0) return 0;
  try {
    const res = await fetch("/data/seed-contacts.json");
    const seed: Array<Record<string, unknown>> = await res.json();
    const { data: { user } } = await supabase.auth.getUser();
    const rows = seed.map((c) => ({ ...c, created_by: user?.id ?? null, owner_id: user?.id ?? null }));
    const BATCH = 250;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase.from("contacts").insert(chunk);
      if (error) { console.error("Seed batch failed:", error); break; }
      inserted += chunk.length;
    }
    return inserted;
  } catch (e) { console.error(e); return 0; }
}
