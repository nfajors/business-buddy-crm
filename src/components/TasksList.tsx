import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteTask, useToggleTaskStatus } from "@/lib/mutations";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TasksList({ tasks, showContactLink = false }: { tasks: Task[]; showContactLink?: boolean }) {
  const { user, isAdmin } = useAuth();
  const toggle = useToggleTaskStatus();
  const del = useDeleteTask();

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => {
        const done = t.status === "done";
        const overdue = !done && t.due_at && isPast(new Date(t.due_at));
        const canEdit = isAdmin || t.created_by === user?.id || t.assignee_id === user?.id;
        return (
          <li key={t.id} className="flex items-start gap-3 py-3">
            <Checkbox
              className="mt-1"
              checked={done}
              disabled={!canEdit || toggle.isPending}
              onCheckedChange={(v) => toggle.mutate({ id: t.id, status: v ? "done" : "open", userId: user?.id })}
              aria-label={done ? "Mark task open" : "Mark task done"}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("font-medium text-sm", done && "line-through text-muted-foreground")}>{t.title}</span>
                {t.priority === "high" && <Badge variant="destructive" className="text-[10px]">High</Badge>}
                {t.priority === "low" && <Badge variant="secondary" className="text-[10px]">Low</Badge>}
                {overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
              </div>
              {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{t.description}</p>}
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                {t.due_at && <span>Due {formatDistanceToNow(new Date(t.due_at), { addSuffix: true })}</span>}
                {showContactLink && t.contact_id && (
                  <Link to={`/contacts/${t.contact_id}`} className="hover:text-gold-dark">Open contact</Link>
                )}
              </div>
            </div>
            {canEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => del.mutate({ id: t.id, contactId: t.contact_id })}
                aria-label="Delete task">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}