import { useState } from "react";
import { Loader2, Plus, CheckSquare } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { TasksList } from "@/components/TasksList";
import type { TaskStatus } from "@/lib/types";

export default function Tasks() {
  const { user } = useAuth();
  const [status, setStatus] = useState<TaskStatus | "all">("open");
  const [assignee, setAssignee] = useState<"all" | "me">("me");
  const [openNew, setOpenNew] = useState(false);
  const { data: tasks = [], isLoading } = useTasks({ status, assignee, currentUserId: user?.id });

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto">
        <PageHeader
          title="Tasks"
          description={tasks.length === 0 ? "No tasks match" : `${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
          action={<Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New task</Button>}
        />
        <div className="bg-card border border-border rounded-xl shadow-elegant overflow-hidden">
          <div className="flex gap-3 p-4 border-b border-border">
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus | "all")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignee} onValueChange={(v) => setAssignee(v as "all" | "me")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="all">Everyone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
            ) : tasks.length === 0 ? (
              <EmptyState icon={CheckSquare} title="No tasks" description="Stay on top of follow-ups by creating your first task."
                action={<Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New task</Button>} />
            ) : (
              <TasksList tasks={tasks} showContactLink />
            )}
          </div>
        </div>
      </div>
      <NewTaskDialog open={openNew} onOpenChange={setOpenNew} />
    </AppLayout>
  );
}