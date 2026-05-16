import { supabase } from "@/integrations/supabase/client";

// Fetch all rows from a table, paginating past Supabase's 1000-row cap.
// NOTE: pages should migrate to server-side filters + pagination (Block 2).
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
