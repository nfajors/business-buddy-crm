import { zerodb } from "@/integrations/zerodb/client";
import type { Contact } from "@/integrations/zerodb/types";

// Paginated full-table fetch. Currently unused but kept as the canonical
// pagination pattern for one-off scripts that need every row (CSV export,
// backfills, etc.). Migrated to ZeroDB in #8.
export async function fetchAllContacts(
  orderCol: "created_at" | "updated_at" | "first_name" | "company" = "created_at",
): Promise<Contact[]> {
  const PAGE = 1000;
  const all: Contact[] = [];
  let offset = 0;
  while (true) {
    const res = await zerodb.tables.query("contacts", {
      sort: [{ field: orderCol, direction: "desc" }],
      limit: PAGE,
      offset,
    });
    all.push(...res.records);
    if (res.records.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
