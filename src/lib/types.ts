import { z } from "zod";

// Re-export ZeroDB row types as the app's public types. Was previously
// derived from the generated Supabase Database type; switched in #5/#6
// alongside the call-site migration. Same names, drop-in replacement —
// `@/lib/types` consumers don't need to know which backend they're on.
export type {
  Activity,
  ActivityType,
  AppRole,
  Contact,
  ContactInsert,
  ContactUpdate,
  EmailStatus,
  Note,
  PipelineStage,
  Profile,
  Task,
  TaskInsert,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
} from "@/integrations/zerodb/types";

import type { PipelineStage } from "@/integrations/zerodb/types";

// Zod enum schemas — added in #3 ahead of the ZeroDB migration. The NoSQL
// Tables API has no native enum, so the app is the only thing validating
// these values on writes.
export const PipelineStageSchema = z.enum(["new", "contacted", "responded", "meeting", "closed"]);
export const ActivityTypeSchema = z.enum([
  "stage_change",
  "note",
  "call",
  "email",
  "meeting",
  "created",
  "task_created",
  "task_completed",
]);
export const TaskStatusSchema = z.enum(["open", "done", "cancelled"]);
export const TaskPrioritySchema = z.enum(["low", "normal", "high"]);
export const AppRoleSchema = z.enum(["admin", "user"]);
export const EmailStatusSchema = z.enum([
  "unknown",
  "valid",
  "invalid",
  "catchall",
  "accept_all",
  "disposable",
  "role",
  "unverified",
]);

export const PIPELINE_STAGES: { value: PipelineStage; label: string; color: string }[] = [
  { value: "new", label: "New", color: "stage-new" },
  { value: "contacted", label: "Contacted", color: "stage-contacted" },
  { value: "responded", label: "Responded", color: "stage-responded" },
  { value: "meeting", label: "Meeting Scheduled", color: "stage-meeting" },
  { value: "closed", label: "Closed", color: "stage-closed" },
];
