import { supabase } from "@/integrations/supabase/client";
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
    const { error } = await supabase.from("contacts").insert(rows);
    if (error) { console.error("Seed failed:", error); return 0; }
    return rows.length;
  } catch (e) { console.error(e); return 0; }
}
