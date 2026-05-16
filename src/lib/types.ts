import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

// Pull row + enum types straight from the generated Supabase schema.
// Editing the parallel hand-written interfaces is a foot-gun (item 16).
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];
export type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];
export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export type PipelineStage = Database["public"]["Enums"]["pipeline_stage"];
export type EmailStatus = Database["public"]["Enums"]["email_status"];
export type ActivityType = Database["public"]["Enums"]["activity_type"];
export type AppRole = Database["public"]["Enums"]["app_role"];

// Zod enum schemas — added in #3 ahead of the ZeroDB migration. The NoSQL
// Tables API has no native enum, so the app is the only thing validating
// these values on writes. Source of truth for #4–#6.
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