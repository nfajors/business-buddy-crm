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
  title: string | null;
  company: string;
  industry: string | null;
  employees: number | null;
  annual_revenue: number | null;
  website: string | null;
  linkedin: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  company_city: string | null;
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

export type ContactInsert = Omit<Contact, "id" | "created_at" | "updated_at" | "search_blob"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  search_blob?: string;
};

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

export type TaskInsert = Omit<Task, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type TaskUpdate = Partial<Omit<Task, "id">>;

export interface Profile {
  id: string;
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
  notes: { Row: Note; Insert: Omit<Note, "id" | "created_at"> & { id?: string; created_at?: string }; Update: Partial<Note> };
  activities: { Row: Activity; Insert: Omit<Activity, "id" | "created_at"> & { id?: string; created_at?: string }; Update: Partial<Activity> };
  tasks: { Row: Task; Insert: TaskInsert; Update: TaskUpdate };
  profiles: { Row: Profile; Insert: Omit<Profile, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string }; Update: Partial<Profile> };
  user_roles: { Row: UserRole; Insert: Omit<UserRole, "id" | "created_at"> & { id?: string; created_at?: string }; Update: Partial<UserRole> };
}
