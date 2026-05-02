export type PipelineStage = "new" | "contacted" | "responded" | "meeting" | "closed";

export const PIPELINE_STAGES: { value: PipelineStage; label: string; color: string }[] = [
  { value: "new", label: "New", color: "stage-new" },
  { value: "contacted", label: "Contacted", color: "stage-contacted" },
  { value: "responded", label: "Responded", color: "stage-responded" },
  { value: "meeting", label: "Meeting Scheduled", color: "stage-meeting" },
  { value: "closed", label: "Closed", color: "stage-closed" },
];

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  email: string;
  email_status: string;
  work_phone: string;
  mobile_phone: string;
  employees: number;
  industry: string;
  linkedin: string;
  website: string;
  city: string;
  state: string;
  country: string;
  company_city: string;
  annual_revenue: number;
  pipeline_stage: PipelineStage;
  tags: string[];
  owner_id: string | null;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  contact_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
}

export interface Activity {
  id: string;
  contact_id: string;
  actor_id: string | null;
  type: "stage_change" | "note" | "call" | "email" | "meeting" | "created";
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type AppRole = "admin" | "user";