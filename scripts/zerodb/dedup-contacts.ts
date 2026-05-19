// Duplicate-contact analysis + cleanup tool.
//
// Default: DRY RUN — scans the contacts table, groups by several dedup
// keys, prints summary counts, and exits without writing. Pass --apply
// plus --by=<key> to actually delete losers from each duplicate group.
//
// Usage (from repo root):
//   npx tsx scripts/zerodb/dedup-contacts.ts                  # dry-run, all keys
//   npx tsx scripts/zerodb/dedup-contacts.ts --show=Zimmerman # dry-run + sample
//   npx tsx scripts/zerodb/dedup-contacts.ts --by=email --apply
//
// Env needed: VITE_CRM_PROXY_URL (defaults to api.winning.careers proxy),
// VITE_ZERODB_API_KEY.
//
// "Loser" in each duplicate group = every row except the WINNER. Winner
// is chosen as: most-recent `last_activity_at`, then most-recent
// `updated_at`, then oldest `created_at` (assumes the oldest row is the
// canonical one, newer rows are stale Apollo re-imports). All other rows
// in the group are deleted.

const PROXY_URL = process.env.VITE_CRM_PROXY_URL ?? "https://api.winning.careers/api/v1/crm";
const API_KEY = process.env.VITE_ZERODB_API_KEY;

if (!API_KEY) {
  console.error("VITE_ZERODB_API_KEY missing from environment (.env)");
  process.exit(1);
}

type Contact = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  pipeline_stage?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
};

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
};
const flag = (name: string): boolean => argv.includes(`--${name}`);

const APPLY = flag("apply");
const SHOW = arg("show");
const BY = arg("by") as DedupKey | undefined;

type DedupKey = "email" | "name_company" | "name_email";

const DEDUP_KEYS: DedupKey[] = ["email", "name_company", "name_email"];

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function keyFor(c: Contact, k: DedupKey): string | null {
  switch (k) {
    case "email": {
      const e = norm(c.email);
      return e ? `e:${e}` : null;
    }
    case "name_company": {
      const fn = norm(c.first_name);
      const ln = norm(c.last_name);
      const co = norm(c.company);
      if (!fn && !ln) return null;
      return `nc:${fn}|${ln}|${co}`;
    }
    case "name_email": {
      const fn = norm(c.first_name);
      const ln = norm(c.last_name);
      const e = norm(c.email);
      if (!fn && !ln) return null;
      return `ne:${fn}|${ln}|${e}`;
    }
  }
}

async function fetchAll(): Promise<Contact[]> {
  const PAGE = 500;
  const HARD_MAX = 50_000;
  const out: Contact[] = [];
  for (let offset = 0; offset < HARD_MAX; offset += PAGE) {
    const url = `${PROXY_URL}/tables/contacts/rows?limit=${PAGE}&skip=${offset}&sort_by=created_at&sort_order=asc`;
    const res = await fetch(url, { headers: { "X-API-Key": API_KEY! } });
    if (!res.ok) {
      throw new Error(`fetch failed at offset ${offset}: ${res.status} ${await res.text()}`);
    }
    const body = await res.json() as { data: { row_data: Contact; row_id: string }[] };
    const rows = (body.data ?? []).map((r) => ({ id: r.row_id, ...r.row_data }));
    out.push(...rows);
    process.stdout.write(`\rfetched ${out.length}…`);
    if (rows.length < PAGE) break;
  }
  process.stdout.write("\n");
  return out;
}

async function deleteRow(id: string): Promise<void> {
  const url = `${PROXY_URL}/tables/contacts/rows/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: "DELETE", headers: { "X-API-Key": API_KEY! } });
  if (!res.ok) {
    throw new Error(`delete ${id} failed: ${res.status} ${await res.text()}`);
  }
}

function chooseWinner(group: Contact[]): Contact {
  return [...group].sort((a, b) => {
    const aa = a.last_activity_at ?? "";
    const bb = b.last_activity_at ?? "";
    if (aa !== bb) return aa < bb ? 1 : -1; // recent last_activity wins
    const au = a.updated_at ?? "";
    const bu = b.updated_at ?? "";
    if (au !== bu) return au < bu ? 1 : -1; // recent updated_at wins
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    if (ac !== bc) return ac < bc ? -1 : 1; // OLDEST created_at wins (canonical)
    return 0;
  })[0];
}

function groupBy(contacts: Contact[], k: DedupKey): Map<string, Contact[]> {
  const groups = new Map<string, Contact[]>();
  for (const c of contacts) {
    const key = keyFor(c, k);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  for (const [k2, v] of groups) {
    if (v.length < 2) groups.delete(k2);
  }
  return groups;
}

function summarize(label: DedupKey, groups: Map<string, Contact[]>) {
  let dupRows = 0;
  for (const v of groups.values()) dupRows += v.length;
  const lossIfDeduped = dupRows - groups.size;
  console.log(`  ${label.padEnd(13)} groups=${groups.size.toString().padStart(5)}  rows-in-groups=${dupRows.toString().padStart(5)}  would-delete=${lossIfDeduped}`);
}

function fmtRow(c: Contact): string {
  return `    ${c.id} | ${c.first_name ?? ""} ${c.last_name ?? ""} | ${c.email ?? "-"} | ${c.company ?? "-"} | created=${c.created_at?.slice(0, 10) ?? "?"} act=${c.last_activity_at?.slice(0, 10) ?? "-"}`;
}

async function main() {
  console.log(`mode=${APPLY ? "APPLY" : "DRY-RUN"}  by=${BY ?? "(all keys)"}  show=${SHOW ?? "(none)"}`);
  console.log(`fetching contacts from ${PROXY_URL}…`);
  const all = await fetchAll();
  console.log(`total contacts: ${all.length}`);

  if (SHOW) {
    const needle = SHOW.toLowerCase();
    const matches = all.filter((c) =>
      norm(c.first_name).includes(needle) ||
      norm(c.last_name).includes(needle) ||
      norm(c.email).includes(needle) ||
      norm(c.company).includes(needle)
    );
    console.log(`\nrows matching "${SHOW}" (${matches.length}):`);
    matches.forEach((c) => console.log(fmtRow(c)));
  }

  console.log(`\nduplicate groups per key:`);
  const groupsByKey = new Map<DedupKey, Map<string, Contact[]>>();
  for (const k of DEDUP_KEYS) {
    const g = groupBy(all, k);
    groupsByKey.set(k, g);
    summarize(k, g);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — no rows deleted)`);
    console.log(`to delete duplicates, re-run with --apply --by=<email|name_company|name_email>`);
    return;
  }

  if (!BY) {
    console.error(`--apply requires --by=<email|name_company|name_email>`);
    process.exit(2);
  }
  const groups = groupsByKey.get(BY)!;
  console.log(`\nAPPLY mode: deduping by ${BY} — ${groups.size} groups`);

  let deleted = 0;
  let failed = 0;
  for (const [key, group] of groups) {
    const winner = chooseWinner(group);
    const losers = group.filter((c) => c.id !== winner.id);
    for (const l of losers) {
      try {
        await deleteRow(l.id);
        deleted++;
        if (deleted % 25 === 0) process.stdout.write(`\rdeleted ${deleted}…`);
      } catch (err) {
        failed++;
        console.error(`\nfailed delete ${l.id} (${key}): ${(err as Error).message}`);
      }
    }
  }
  process.stdout.write("\n");
  console.log(`\ndone. deleted=${deleted}  failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
