// Contact-table wipe tool — clears the CRM so a clean list can be
// re-imported.
//
// SAFETY: --apply ALWAYS writes a full JSON backup of every row it is
// about to delete, to scripts/zerodb/backups/<table>-<timestamp>.json,
// BEFORE issuing a single DELETE. Restore is a manual re-import of that
// file. Default mode is dry-run.
//
// Usage (from repo root):
//   node --env-file=.env --import tsx scripts/zerodb/wipe-contacts.ts
//       → dry-run: prints row counts, writes nothing
//   node --env-file=.env --import tsx scripts/zerodb/wipe-contacts.ts --apply
//       → backs up + deletes every row in `contacts`
//   node --env-file=.env --import tsx scripts/zerodb/wipe-contacts.ts \
//       --tables=contacts,notes,activities --apply
//       → also wipes the listed related tables
//
// Env needed: VITE_CRM_PROXY_URL (defaults to api.winning.careers proxy),
// VITE_ZERODB_API_KEY.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROXY_URL = process.env.VITE_CRM_PROXY_URL ?? "https://api.winning.careers/api/v1/crm";
const API_KEY = process.env.VITE_ZERODB_API_KEY;

if (!API_KEY) {
  console.error("VITE_ZERODB_API_KEY missing from environment (.env)");
  process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const arg = (name: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
};

const APPLY = flag("apply");
const TABLES = (arg("tables") ?? "contacts").split(",").map((t) => t.trim()).filter(Boolean);

const BACKUP_DIR = join("scripts", "zerodb", "backups");

type Row = { id: string; [k: string]: unknown };

async function fetchAll(table: string): Promise<Row[]> {
  const PAGE = 500;
  const HARD_MAX = 100_000;
  const out: Row[] = [];
  for (let offset = 0; offset < HARD_MAX; offset += PAGE) {
    const url = `${PROXY_URL}/tables/${table}/rows?limit=${PAGE}&skip=${offset}`;
    const res = await fetch(url, { headers: { "X-API-Key": API_KEY! } });
    if (!res.ok) {
      throw new Error(`fetch ${table} failed at offset ${offset}: ${res.status} ${await res.text()}`);
    }
    const body = await res.json() as { data: { row_data: Record<string, unknown>; row_id: string }[] };
    const rows = (body.data ?? []).map((r) => ({ id: r.row_id, ...r.row_data }));
    out.push(...rows);
    process.stdout.write(`\r  ${table}: fetched ${out.length}…`);
    if (rows.length < PAGE) break;
  }
  process.stdout.write("\n");
  return out;
}

async function deleteRow(table: string, id: string): Promise<void> {
  const url = `${PROXY_URL}/tables/${table}/rows/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: "DELETE", headers: { "X-API-Key": API_KEY! } });
  if (!res.ok) {
    throw new Error(`delete ${table}/${id} failed: ${res.status} ${await res.text()}`);
  }
}

function backup(table: string, rows: Row[]): string {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(BACKUP_DIR, `${table}-${stamp}.json`);
  writeFileSync(path, JSON.stringify(rows, null, 2), "utf8");
  return path;
}

async function main() {
  console.log(`mode=${APPLY ? "APPLY" : "DRY-RUN"}  tables=${TABLES.join(", ")}`);
  console.log(`proxy=${PROXY_URL}\n`);

  const fetched = new Map<string, Row[]>();
  for (const table of TABLES) {
    const rows = await fetchAll(table);
    fetched.set(table, rows);
    console.log(`  ${table}: ${rows.length} rows`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — nothing deleted, no backup written)`);
    console.log(`to wipe, re-run with --apply`);
    return;
  }

  console.log(`\nwriting backups…`);
  for (const table of TABLES) {
    const rows = fetched.get(table)!;
    if (rows.length === 0) { console.log(`  ${table}: 0 rows, skipping backup`); continue; }
    const path = backup(table, rows);
    console.log(`  ${table}: backed up ${rows.length} rows → ${path}`);
  }

  for (const table of TABLES) {
    const rows = fetched.get(table)!;
    if (rows.length === 0) continue;
    console.log(`\ndeleting ${rows.length} rows from ${table}…`);
    let deleted = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await deleteRow(table, r.id);
        deleted++;
        if (deleted % 25 === 0) process.stdout.write(`\r  deleted ${deleted}/${rows.length}…`);
      } catch (err) {
        failed++;
        console.error(`\n  ${(err as Error).message}`);
      }
    }
    process.stdout.write("\n");
    console.log(`  ${table}: deleted=${deleted} failed=${failed}`);
  }

  console.log(`\ndone. backups are in ${BACKUP_DIR}/ — keep them until the re-import is verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
