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

const API_URL = import.meta.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";
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

  async request<T>(path: string, init: RequestInit & { skipAuth?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
    if (API_KEY) headers.set("X-API-Key", API_KEY);
    if (!init.skipAuth && this.session?.token) {
      headers.set("Authorization", `Bearer ${this.session.token}`);
    }

    const res = await fetch(`${API_URL}${path}`, { ...init, headers });
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
    const res = await this.client.request<AuthResponse>("/public/auth/login-json", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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

  private base(table: TableName): string {
    return `/projects/${this.client.projectId}/tables/${table}`;
  }

  async query<T extends TableName>(
    table: T,
    options: QueryOptions = {},
  ): Promise<QueryResult<TableSchemas[T]["Row"]>> {
    return this.client.request(`${this.base(table)}/query`, {
      method: "POST",
      body: JSON.stringify(options),
    });
  }

  async get<T extends TableName>(
    table: T,
    id: string,
  ): Promise<TableSchemas[T]["Row"]> {
    return this.client.request(`${this.base(table)}/records/${encodeURIComponent(id)}`);
  }

  async insert<T extends TableName>(
    table: T,
    record: TableSchemas[T]["Insert"],
  ): Promise<TableSchemas[T]["Row"]> {
    return this.client.request(`${this.base(table)}/records`, {
      method: "POST",
      body: JSON.stringify(record),
    });
  }

  async insertMany<T extends TableName>(
    table: T,
    records: TableSchemas[T]["Insert"][],
  ): Promise<TableSchemas[T]["Row"][]> {
    return this.client.request(`${this.base(table)}/records/batch`, {
      method: "POST",
      body: JSON.stringify({ records }),
    });
  }

  async update<T extends TableName>(
    table: T,
    id: string,
    patch: TableSchemas[T]["Update"],
  ): Promise<TableSchemas[T]["Row"]> {
    return this.client.request(`${this.base(table)}/records/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    await this.client.request(`${this.base(table)}/records/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async count<T extends TableName>(table: T, filter: Record<string, unknown> = {}): Promise<number> {
    const res = await this.query(table, { filter, limit: 0 });
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
