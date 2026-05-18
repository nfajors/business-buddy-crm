// One-off bootstrap script for a fresh ZeroDB project. Creates the 6 tables
// the CRM expects (contacts, notes, activities, tasks, profiles, user_roles)
// with field types + required-field constraints. Idempotent: existing
// tables are skipped.
//
// Usage:
//   node --env-file=.env --import tsx scripts/zerodb/bootstrap.ts
//
// Requires env: VITE_ZERODB_API_URL, VITE_ZERODB_PROJECT_ID, VITE_ZERODB_API_KEY,
// plus ZERODB_ADMIN_EMAIL + ZERODB_ADMIN_PASSWORD for the login that mints a
// JWT scoped to table-create.
//
// NOTE: the exact create-table endpoint shape on ZeroDB has not been
// verified against live docs at the time of writing (#3). Endpoint paths
// and the field-spec format are isolated below in `createTable` and
// `TABLES` so they can be adjusted in one place once confirmed.

const API_URL = process.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";
const PROJECT_ID = process.env.VITE_ZERODB_PROJECT_ID;
const API_KEY = process.env.VITE_ZERODB_API_KEY;

type FieldType = "string" | "text" | "number" | "boolean" | "timestamp" | "json" | "string[]";

interface FieldSpec {
  name: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: unknown;
}

interface TableSpec {
  name: string;
  fields: FieldSpec[];
  indexes?: string[];
}

const TABLES: TableSpec[] = [
  {
    name: "contacts",
    fields: [
      { name: "first_name", type: "string", required: true, defaultValue: "" },
      { name: "last_name", type: "string" },
      { name: "email", type: "string" },
      { name: "email_status", type: "string", defaultValue: "unknown" },
      { name: "work_phone", type: "string" },
      { name: "mobile_phone", type: "string" },
      { name: "title", type: "string" },
      { name: "company", type: "string", required: true, defaultValue: "" },
      { name: "industry", type: "string" },
      { name: "employees", type: "number" },
      { name: "annual_revenue", type: "number" },
      { name: "website", type: "string" },
      { name: "linkedin", type: "string" },
      { name: "city", type: "string" },
      { name: "state", type: "string" },
      { name: "country", type: "string" },
      { name: "company_city", type: "string" },
      { name: "tags", type: "string[]", defaultValue: [] },
      { name: "pipeline_stage", type: "string", required: true, defaultValue: "new" },
      { name: "owner_id", type: "string" },
      { name: "created_by", type: "string" },
      { name: "updated_by", type: "string" },
      { name: "last_activity_at", type: "timestamp" },
      // Denormalized lowercase concat of name/email/company/tags for client-side
      // LIKE search — replaces Postgres FTS `search_tsv`. Maintained in the app.
      { name: "search_blob", type: "text", defaultValue: "" },
      { name: "created_at", type: "timestamp", required: true },
      { name: "updated_at", type: "timestamp", required: true },
    ],
    indexes: ["owner_id", "pipeline_stage", "search_blob"],
  },
  {
    name: "notes",
    fields: [
      { name: "contact_id", type: "string", required: true },
      { name: "content", type: "text", required: true },
      { name: "author_id", type: "string" },
      { name: "updated_by", type: "string" },
      { name: "created_at", type: "timestamp", required: true },
    ],
    indexes: ["contact_id"],
  },
  {
    name: "activities",
    fields: [
      { name: "contact_id", type: "string", required: true },
      { name: "type", type: "string", required: true },
      { name: "description", type: "text", defaultValue: "" },
      { name: "actor_id", type: "string" },
      { name: "metadata", type: "json", defaultValue: {} },
      { name: "created_at", type: "timestamp", required: true },
    ],
    indexes: ["contact_id", "created_at"],
  },
  {
    name: "tasks",
    fields: [
      { name: "title", type: "string", required: true },
      { name: "description", type: "text" },
      { name: "contact_id", type: "string" },
      { name: "assignee_id", type: "string" },
      { name: "created_by", type: "string" },
      { name: "status", type: "string", required: true, defaultValue: "open" },
      { name: "priority", type: "string", required: true, defaultValue: "normal" },
      { name: "due_at", type: "timestamp" },
      { name: "completed_at", type: "timestamp" },
      { name: "completed_by", type: "string" },
      { name: "created_at", type: "timestamp", required: true },
      { name: "updated_at", type: "timestamp", required: true },
    ],
    indexes: ["assignee_id", "contact_id", "status", "due_at"],
  },
  {
    name: "profiles",
    fields: [
      // user_id mirrors session.user.id (email). The save path also writes
      // it into `id` inside row_data as a fallback because the proxy is
      // known to drop fields not declared here (#34).
      { name: "user_id", type: "string" },
      { name: "display_name", type: "string" },
      { name: "avatar_url", type: "text" },
      { name: "created_at", type: "timestamp", required: true },
      { name: "updated_at", type: "timestamp", required: true },
    ],
  },
  {
    name: "user_roles",
    fields: [
      { name: "user_id", type: "string", required: true },
      { name: "role", type: "string", required: true, defaultValue: "user" },
      { name: "created_at", type: "timestamp", required: true },
    ],
    indexes: ["user_id"],
  },
];

async function createTable(spec: TableSpec): Promise<"created" | "exists"> {
  if (!API_KEY) throw new Error("VITE_ZERODB_API_KEY is required.");
  // Endpoint: POST /api/v1/projects/{id}/database/tables
  // API_URL is https://api.ainative.studio/v1 — strip /v1 for the /api/v1/... path
  const baseUrl = API_URL.replace(/\/v1$/, "");
  const res = await fetch(`${baseUrl}/api/v1/projects/${PROJECT_ID}/database/tables`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ table_name: spec.name }),
  });
  if (res.ok) return "created";
  const text = await res.text();
  if (res.status === 409 || /already exists/i.test(text) || /duplicate/i.test(text)) return "exists";
  throw new Error(`create-table ${spec.name} failed: ${res.status} ${text}`);
}

async function main() {
  if (!PROJECT_ID) throw new Error("VITE_ZERODB_PROJECT_ID is required.");
  if (!API_KEY) throw new Error("VITE_ZERODB_API_KEY is required.");
  console.log(`[bootstrap] api=${API_URL} project=${PROJECT_ID}`);
  for (const spec of TABLES) {
    const result = await createTable(spec);
    console.log(`[bootstrap] ${spec.name}: ${result}`);
  }
  console.log("[bootstrap] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
