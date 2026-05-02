import { PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { cn } from "@/lib/utils";
export function StageBadge({ stage, className }: { stage: PipelineStage; className?: string }) {
  const meta = PIPELINE_STAGES.find((s) => s.value === stage) ?? PIPELINE_STAGES[0];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold", className)}
      style={{ backgroundColor: `hsl(var(--${meta.color}) / 0.12)`, color: `hsl(var(--${meta.color}))` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(--${meta.color}))` }} />
      {meta.label}
    </span>
  );
}
