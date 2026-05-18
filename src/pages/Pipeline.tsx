import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, X } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PIPELINE_STAGES, PipelineStage } from "@/lib/types";
import { PIPELINE_COLUMN_CAP, PipelineCard, usePipeline } from "@/lib/queries";
import { useUpdateStage } from "@/lib/mutations";

export default function Pipeline() {
  const { data, isLoading } = usePipeline();
  const updateStage = useUpdateStage();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const rawColumns = data ?? ({} as Record<PipelineStage, PipelineCard[]>);

  const { columns, filterActive } = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return { columns: rawColumns, filterActive: false };
    const filtered = {} as Record<PipelineStage, PipelineCard[]>;
    for (const stage of PIPELINE_STAGES) {
      const items = rawColumns[stage.value] ?? [];
      filtered[stage.value] = items.filter((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return (
          name.includes(q) ||
          (c.title ?? "").toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q)
        );
      });
    }
    return { columns: filtered, filterActive: true };
  }, [rawColumns, debouncedSearch]);

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    for (const stage of PIPELINE_STAGES) {
      const found = columns[stage.value]?.find((c) => c.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, columns]);

  // Detail-page link uses contact id, so we expose pendingId so the user
  // sees a visual cue while the mutation is in flight.
  const [pendingId, setPendingId] = useState<string | null>(null);
  useEffect(() => {
    if (!updateStage.isPending) setPendingId(null);
  }, [updateStage.isPending]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const id = String(e.active.id);
    const stage = String(e.over.id) as PipelineStage;
    const current = e.active.data.current?.stage as PipelineStage | undefined;
    if (!current || current === stage) return;
    setPendingId(id);
    updateStage.mutate({ id, stage });
  };

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-[100rem] mx-auto">
        <PageHeader title="Pipeline" description="Drag contacts between stages to update outreach status." />
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, title, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {PIPELINE_STAGES.map((stage) => {
                const items = columns[stage.value] ?? [];
                const total = (rawColumns[stage.value] ?? []).length;
                return (
                  <Column
                    key={stage.value}
                    stage={stage.value}
                    label={stage.label}
                    color={stage.color}
                    count={items.length}
                    total={filterActive ? total : undefined}
                  >
                    <div className="space-y-2">
                      {items.map((c) => (
                        <Card key={c.id} card={c} pending={pendingId === c.id} />
                      ))}
                      {items.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">
                          {filterActive ? "No matches." : "No contacts in this stage."}
                        </p>
                      )}
                      {!filterActive && total >= PIPELINE_COLUMN_CAP && (
                        <Link to={`/contacts?stage=${stage.value}`} className="block text-xs text-center text-gold-dark hover:underline py-1">
                          View all →
                        </Link>
                      )}
                    </div>
                  </Column>
                );
              })}
            </div>
            <DragOverlay>
              {activeCard ? <CardSurface card={activeCard} dragging /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </AppLayout>
  );
}

function Column({ stage, label, color, count, total, children }: { stage: PipelineStage; label: string; color: string; count: number; total?: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl p-3 min-h-[400px] border transition-colors ${isOver ? "bg-secondary border-gold" : "bg-secondary/40 border-border"}`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${color}))` }} />
          <h3 className="font-bold text-sm">{label}</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {total !== undefined ? `${count} / ${total}` : count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Card({ card, pending }: { card: PipelineCard; pending: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { stage: card.pipeline_stage },
    disabled: pending,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${isDragging ? "opacity-30" : ""} ${pending ? "opacity-60 pointer-events-none" : ""}`}
    >
      <Link to={`/contacts/${card.id}`} onClick={(e) => { if (pending) e.preventDefault(); }}>
        <CardSurface card={card} />
      </Link>
    </div>
  );
}

function CardSurface({ card, dragging }: { card: PipelineCard; dragging?: boolean }) {
  return (
    <div className={`block bg-card rounded-lg p-3 shadow-elegant ${dragging ? "shadow-hover ring-2 ring-gold" : "hover:shadow-hover"} cursor-grab active:cursor-grabbing transition-smooth`}>
      <div className="font-semibold text-sm">{card.first_name} {card.last_name}</div>
      <div className="text-xs text-muted-foreground truncate">{card.title}</div>
      <div className="text-xs text-gold-dark mt-1 truncate">{card.company}</div>
    </div>
  );
}
