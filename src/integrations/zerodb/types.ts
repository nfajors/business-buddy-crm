// ZeroDB row types. Mirrors the Supabase schema 1:1 so call sites can swap
// the import path without restructuring data shapes. Created in #2 for the
// Supabase → ZeroDB migration (epic #1); ships alongside Supabase types and
// is unused at call sites until #4–#6 land.

export type PipelineStage = "new" | "contacted" | "responded" | "meeting" | "closed";

export type ActivityType =
  | "stage_change"
  | "note"
  | "call"
  | "email"
  | "meeting"
  | "created"
  | "task_created"
  | "task_completed";

export type TaskStatus = "open" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high";
export type AppRole = "admin" | "user";

export type EmailStatus =
  | "unknown"
  | "valid"
  | "invalid"
  | "catchall"
  | "accept_all"
  | "disposable"
  | "role"
  | "unverified";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  email_status: EmailStatus | null;
  work_phone: string | null;
  mobile_phone: string | null;
  corporate_phone: string | null;
  other_phone: string | null;
  company_phone: string | null;
  secondary_email: string | null;
  keywords: string | null;
  title: string | null;
  company: string;
  industry: string | null;
  employees: number | null;
  annual_revenue: number | null;
  website: string | null;
  linkedin: string | null;
  company_linkedin: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  company_address: string | null;
  company_city: string | null;
  company_state: string | null;
  company_country: string | null;
  tags: string[];
  pipeline_stage: PipelineStage;
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  last_activity_at: string | null;
  search_blob: string;
  created_at: string;
  updated_at: string;
}

// Insert + Update are intentionally lenient (every field optional) — the
// Tables API has no schema-enforced defaults like Postgres, so the app
// fills required fields in `stampContactForInsert` (#7). Keeping these as
// Partial<Contact> matches the ergonomics of the Supabase Insert type
// that call sites are coming from.
export type ContactInsert = Partial<Contact>;
export type ContactUpdate = Partial<Omit<Contact, "id">>;

export interface Note {
  id: string;
  contact_id: string;
  content: string;
  author_id: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  contact_id: string;
  type: ActivityType;
  description: string;
  actor_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  contact_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskInsert = Partial<Task>;
export type TaskUpdate = Partial<Omit<Task, "id">>;

export interface Profile {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface ZeroDBUser {
  id: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: ZeroDBUser;
  expiresAt: number;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  user?: ZeroDBUser;
}

export interface QueryOptions {
  filter?: Record<string, unknown>;
  search?: { field: string; value: string };
  sort?: { field: string; direction: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

export interface QueryResult<T> {
  records: T[];
  total: number;
}

export type TableName =
  | "contacts"
  | "notes"
  | "activities"
  | "tasks"
  | "profiles"
  | "user_roles";

export interface TableSchemas {
  contacts: { Row: Contact; Insert: ContactInsert; Update: ContactUpdate };
  notes: { Row: Note; Insert: Partial<Note>; Update: Partial<Note> };
  activities: { Row: Activity; Insert: Partial<Activity>; Update: Partial<Activity> };
  tasks: { Row: Task; Insert: TaskInsert; Update: TaskUpdate };
  profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
  user_roles: { Row: UserRole; Insert: Partial<UserRole>; Update: Partial<UserRole> };
}
