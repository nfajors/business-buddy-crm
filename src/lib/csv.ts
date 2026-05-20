import type { Contact, ContactInsert } from "@/lib/types";

// Minimal CSV helpers (no external dep, item 7).

// Column labels mirror the importer's HEADER_MAP so a contact can survive
// an export → re-import round-trip without losing enrichment fields.
const CONTACT_EXPORT_COLUMNS: { key: keyof Contact; label: string }[] = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "email_status", label: "Email Status" },
  { key: "secondary_email", label: "Secondary Email" },
  { key: "work_phone", label: "Work Phone" },
  { key: "mobile_phone", label: "Mobile Phone" },
  { key: "corporate_phone", label: "Corporate Phone" },
  { key: "other_phone", label: "Other Phone" },
  { key: "company_phone", label: "Company Phone" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "company_linkedin", label: "Company LinkedIn" },
  { key: "facebook_url", label: "Facebook Url" },
  { key: "twitter_url", label: "Twitter Url" },
  { key: "website", label: "Website" },
  { key: "industry", label: "Industry" },
  { key: "keywords", label: "Keywords" },
  { key: "employees", label: "# Employees" },
  { key: "annual_revenue", label: "Annual Revenue" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "company_address", label: "Company Address" },
  { key: "company_city", label: "Company City" },
  { key: "company_state", label: "Company State" },
  { key: "company_country", label: "Company Country" },
  { key: "tags", label: "Tags" },
  { key: "pipeline_stage", label: "Stage" },
];

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (Array.isArray(v)) s = (v as unknown[]).join("; ");
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function contactsToCsv(contacts: Contact[]): string {
  const header = CONTACT_EXPORT_COLUMNS.map((c) => c.label).join(",");
  const lines = contacts.map((c) =>
    CONTACT_EXPORT_COLUMNS.map((col) => escapeCell((c as unknown as Record<string, unknown>)[col.key as string])).join(","),
  );
  // CRLF per RFC 4180 — stricter CSV consumers (some BI tools) reject LF-only.
  return [header, ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// CSV parser handling quoted cells with embedded commas/newlines/double-quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch; i++;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  // Strip BOM on first cell
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_MAP: Record<string, keyof ContactInsert> = {
  "first name": "first_name", firstname: "first_name", first_name: "first_name",
  "last name": "last_name", lastname: "last_name", last_name: "last_name",
  title: "title", role: "title",
  company: "company", "company name": "company", organization: "company", organisation: "company",
  email: "email", "email address": "email",
  "secondary email": "secondary_email", secondary_email: "secondary_email",
  "email status": "email_status", email_status: "email_status",
  "work phone": "work_phone", phone: "work_phone", work_phone: "work_phone",
  "work direct phone": "work_phone",
  "corporate phone": "corporate_phone", corporate_phone: "corporate_phone",
  "other phone": "other_phone", other_phone: "other_phone",
  "company phone": "company_phone", company_phone: "company_phone",
  "mobile phone": "mobile_phone", mobile: "mobile_phone", mobile_phone: "mobile_phone",
  linkedin: "linkedin", "linkedin url": "linkedin",
  "person linkedin url": "linkedin", "person linkedin": "linkedin",
  "company linkedin url": "company_linkedin", "company linkedin": "company_linkedin",
  company_linkedin: "company_linkedin",
  "facebook url": "facebook_url", facebook: "facebook_url", facebook_url: "facebook_url",
  "twitter url": "twitter_url", twitter: "twitter_url", twitter_url: "twitter_url",
  website: "website", url: "website",
  industry: "industry",
  keywords: "keywords",
  "# employees": "employees", employees: "employees", "num employees": "employees",
  "annual revenue": "annual_revenue", annual_revenue: "annual_revenue", revenue: "annual_revenue",
  city: "city",
  state: "state", region: "state",
  country: "country",
  "company address": "company_address", company_address: "company_address",
  "company city": "company_city", company_city: "company_city",
  "company state": "company_state", company_state: "company_state",
  "company country": "company_country", company_country: "company_country",
  tags: "tags",
  stage: "pipeline_stage", pipeline_stage: "pipeline_stage", "pipeline stage": "pipeline_stage",
};

const EMAIL_STATUS_MAP: Record<string, string> = {
  valid: "valid", verified: "valid",
  invalid: "invalid", bad: "invalid",
  catchall: "catchall", "catch-all": "catchall", catch_all: "catchall",
  "accept all": "accept_all", accept_all: "accept_all", "accept-all": "accept_all",
  disposable: "disposable",
  role: "role",
  unverified: "unverified",
  unknown: "unknown", "": "unknown",
};

const NUMBER_FIELDS = new Set<keyof ContactInsert>(["employees", "annual_revenue"]);

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const STAGE_MAP: Record<string, string> = {
  new: "new", contacted: "contacted", responded: "responded",
  meeting: "meeting", "meeting scheduled": "meeting", closed: "closed",
};

export type CsvParseResult = {
  rows: ContactInsert[];
  skipped: { rowIndex: number; reason: string }[];
  recognisedColumns: (keyof ContactInsert | null)[];
};

export function csvToContacts(text: string, defaults: Partial<ContactInsert> = {}): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { rows: [], skipped: [], recognisedColumns: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colMap = header.map((h) => HEADER_MAP[h] ?? null);
  const out: ContactInsert[] = [];
  const skipped: { rowIndex: number; reason: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj: Record<string, unknown> = { ...defaults };
    colMap.forEach((key, idx) => {
      if (!key) return;
      const val = (r[idx] ?? "").trim();
      if (!val) return;
      if (key === "pipeline_stage") {
        const mapped = STAGE_MAP[val.toLowerCase()];
        if (mapped) obj[key] = mapped;
      } else if (key === "email_status") {
        const mapped = EMAIL_STATUS_MAP[val.toLowerCase()];
        if (mapped) obj[key] = mapped;
      } else if (NUMBER_FIELDS.has(key)) {
        const n = parseNumeric(val);
        if (n !== null) obj[key] = n;
      } else if (key === "tags") {
        // Exporter joins tags with "; "; accept either that or commas.
        const parts = val.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length) obj[key] = parts;
      } else {
        obj[key] = val;
      }
    });
    if (!obj.first_name && !obj.company) {
      skipped.push({ rowIndex: i + 1, reason: "Missing first name and company" });
      continue;
    }
    obj.first_name = obj.first_name ?? "";
    obj.company = obj.company ?? "";
    if (obj.email && typeof obj.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email)) {
      skipped.push({ rowIndex: i + 1, reason: `Invalid email "${obj.email}"` });
      continue;
    }
    out.push(obj as ContactInsert);
  }
  return { rows: out, skipped, recognisedColumns: colMap };
}