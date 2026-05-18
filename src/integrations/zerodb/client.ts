// ZeroDB client. Wraps fetch with base URL + JWT injection, persists the
// session to localStorage, schedules a 25-min refresh, and exposes a typed
// `tables` accessor. Created in #2 for the Supabase → ZeroDB migration
// (epic #1). Ships alongside Supabase; call sites migrate in #4–#6.

import type {
  AuthResponse,
  AuthSession,
  QueryOptions,
  QueryResult,
  TableName,
  TableSchemas,
  ZeroDBUser,
} from "./types";

const STORAGE_KEY = "zerodb.session";
const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

// Auth/vector endpoints: https://api.ainative.studio/v1
// Table CRUD is proxied through winning-backend to avoid ZeroDB CORS restrictions.
// Proxy URL: https://api.winning.careers/api/v1/crm/tables/{table}/rows
const API_URL = import.meta.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";
const TABLE_API_URL = import.meta.env.VITE_CRM_PROXY_URL ?? "https://api.winning.careers/api/v1/crm";
const PROJECT_ID = import.meta.env.VITE_ZERODB_PROJECT_ID ?? "";
const API_KEY = import.meta.env.VITE_ZERODB_API_KEY ?? "";

type AuthListener = (session: AuthSession | null) => void;

class ZeroDBError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "ZeroDBError";
  }
}

class ZeroDBClient {
  private session: AuthSession | null = null;
  private listeners = new Set<AuthListener>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly auth: AuthAPI;
  readonly tables: TablesAPI;

  constructor() {
    this.session = loadSession();
    if (this.session) this.startRefreshTimer();
    this.auth = new AuthAPI(this);
    this.tables = new TablesAPI(this);

    if (typeof window !== "undefined" && API_URL) {
      // Surface misconfig: a wrong URL means silent 401s at runtime. Key is
      // never logged.
      console.info(`[zerodb] api=${API_URL} project=${PROJECT_ID || "(unset)"}`);
    }
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  onAuthChange(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSession(session: AuthSession | null) {
    this.session = session;
    if (session) {
      saveSession(session);
      this.startRefreshTimer();
    } else {
      clearSession();
      this.stopRefreshTimer();
    }
    for (const l of this.listeners) l(session);
  }

  private startRefreshTimer() {
    this.stopRefreshTimer();
    this.refreshTimer = setInterval(() => {
      this.auth.refresh().catch((err) => {
        console.warn("[zerodb] token refresh failed", err);
      });
    }, REFRESH_INTERVAL_MS);
  }

  private stopRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async request<T>(path: string, init: RequestInit & { skipAuth?: boolean; tableApi?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
    // Per .ainative/CODY.md: auth model is API key only. The previous
    // Authorization: Bearer header was a leftover from the original
    // JWT-based ZeroDB auth path; useAuth.tsx now mints a session whose
    // `token` IS the API key, so sending it as a Bearer was sending the
    // raw API key in a slot the server expects to hold a JWT. That
    // malformed header caused the API's preflight/auth layer to reject
    // requests, surfacing as the opaque "Failed to fetch" on bulk imports.
    // See issue #18. `skipAuth` is kept as a parameter for the dead
    // AuthAPI endpoints; it has no effect now and can be cleaned up later.
    if (API_KEY) {
      if (init.tableApi) {
        // Proxy expects X-CRM-Token; API key is injected server-side by the proxy.
        headers.set("X-CRM-Token", API_KEY);
      } else {
        headers.set("X-API-Key", API_KEY);
      }
    }

    const base = init.tableApi ? TABLE_API_URL : API_URL;
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, headers });
    } catch (err) {
      // fetch() itself throws TypeError ("Failed to fetch") for network failures,
      // CORS preflight rejections, DNS errors, or aborted connections. The bare
      // message is useless in error reports; surface it as a structured error so
      // callers can distinguish it from HTTP responses and retry appropriately.
      const detail = err instanceof Error ? err.message : String(err);
      throw new ZeroDBError(
        `[zerodb] network failure on ${path}: ${detail}`,
        0,
        { error: "network_or_cors_failure", detail, path },
      );
    }
    const text = await res.text();
    const body = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      throw new ZeroDBError(
        `[zerodb] ${res.status} ${res.statusText} on ${path}`,
        res.status,
        body,
      );
    }
    return body as T;
  }

  get projectId(): string {
    return PROJECT_ID;
  }
}

class AuthAPI {
  constructor(private client: ZeroDBClient) {}

  async login(email: string, password: string): Promise<AuthSession> {
    // ZeroDB login-json uses `username` field (not `email`)
    const res = await this.client.request<AuthResponse>("/public/auth/login-json", {
      method: "POST",
      body: JSON.stringify({ username: email, password }),
      skipAuth: true,
    });
    const session = toSession(res, email);
    this.client.setSession(session);
    return session;
  }

  async register(email: string, password: string): Promise<AuthSession> {
    const res = await this.client.request<AuthResponse>("/public/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    const session = toSession(res, email);
    this.client.setSession(session);
    return session;
  }

  logout() {
    this.client.setSession(null);
  }

  // Token refresh: the public refresh endpoint is TBD on the ZeroDB side.
  // Until it's confirmed, this is a no-op stub so the 25-min timer doesn't
  // explode in the console. Wire up the real call here once #4 confirms the
  // endpoint shape.
  async refresh(): Promise<void> {
    // intentionally empty until refresh endpoint is confirmed
  }
}

class TablesAPI {
  constructor(private client: ZeroDBClient) {}

  // Proxy path: /tables/{name} (winning-backend injects project ID server-side)
  private base(table: TableName): string {
    return `/tables/${table}`;
  }

  async query<T extends TableName>(
    table: T,
    options: QueryOptions = {},
  ): Promise<QueryResult<TableSchemas[T]["Row"]>> {
    // ZeroDB Tables API uses GET /rows (no POST /rows/query endpoint).
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("skip", String(options.offset));
    // Filter: pass as JSON string
    if (options.filter && Object.keys(options.filter).length > 0) {
      params.set("filter", JSON.stringify(options.filter));
    }
    // Sort: pass first sort field
    if (options.sort?.[0]) {
      params.set("sort_by", options.sort[0].field);
      params.set("sort_order", options.sort[0].direction ?? "asc");
    }
    // Search: pass as search_value against search_field
    if (options.search) {
      params.set("search_field", options.search.field);
      params.set("search_value", options.search.value);
    }
    const qs = params.toString();
    const raw = await this.client.request<{
      total: number; skip: number; limit: number; has_more: boolean;
      data: { row_data: TableSchemas[T]["Row"]; row_id: string }[];
    }>(`${this.base(table)}/rows${qs ? `?${qs}` : ""}`, { tableApi: true });
    // Unwrap row_data envelope; merge row_id as `id` if not already present.
    const records = (raw.data ?? []).map((r) => ({
      id: r.row_id,
      ...r.row_data,
    })) as TableSchemas[T]["Row"][];
    return { records, total: raw.total };
  }

  async get<T extends TableName>(
    table: T,
    id: string,
  ): Promise<TableSchemas[T]["Row"]> {
    const raw = await this.client.request<{
      row_data: TableSchemas[T]["Row"]; row_id: string;
    }>(`${this.base(table)}/rows/${encodeURIComponent(id)}`, { tableApi: true });
    return { id: raw.row_id, ...raw.row_data };
  }

  async insert<T extends TableName>(
    table: T,
    record: TableSchemas[T]["Insert"],
  ): Promise<TableSchemas[T]["Row"]> {
    const raw = await this.client.request<{
      row_data: TableSchemas[T]["Row"]; row_id: string;
    }>(`${this.base(table)}/rows`, {
      method: "POST",
      body: JSON.stringify({ row_data: record }),
      tableApi: true,
    });
    return { id: raw.row_id, ...raw.row_data };
  }

  async insertMany<T extends TableName>(
    table: T,
    records: TableSchemas[T]["Insert"][],
  ): Promise<TableSchemas[T]["Row"][]> {
    return this.client.request(`${this.base(table)}/rows/bulk`, {
      method: "POST",
      body: JSON.stringify({ records: records.map((r) => ({ row_data: r })) }),
      tableApi: true,
    });
  }

  async update<T extends TableName>(
    table: T,
    id: string,
    patch: TableSchemas[T]["Update"],
  ): Promise<TableSchemas[T]["Row"]> {
    const raw = await this.client.request<{
      row_data: TableSchemas[T]["Row"]; row_id: string;
    }>(`${this.base(table)}/rows/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ row_data: patch }),
      tableApi: true,
    });
    return { id: raw.row_id, ...raw.row_data };
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    await this.client.request(`${this.base(table)}/rows/${encodeURIComponent(id)}`, {
      method: "DELETE",
      tableApi: true,
    });
  }

  async count<T extends TableName>(table: T, filter: Record<string, unknown> = {}): Promise<number> {
    const res = await this.query(table, { filter, limit: 1 });
    return res.total;
  }
}

function toSession(res: AuthResponse, email: string): AuthSession {
  const expiresInSec = res.expires_in ?? 30 * 60;
  return {
    token: res.access_token,
    user: res.user ?? { id: "", email },
    expiresAt: Date.now() + expiresInSec * 1000,
  };
}

function loadSession(): AuthSession | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession(session: AuthSession) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const zerodb = new ZeroDBClient();
export { ZeroDBError };
export type { AuthSession, ZeroDBUser, QueryOptions, QueryResult, TableName };
