import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  MoreHorizontal,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Pencil,
  Trash2,
  Zap,
  Calendar,
} from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { useHousehold } from "@/contexts/HouseholdContext";

interface Task {
  id: number;
  householdId: number;
  eventId: number | null;
  title: string;
  description: string | null;
  category: string;
  subject: string | null;
  ownerMemberId: number;
  status: "open" | "snoozed" | "done";
  deadline: Date | null;
  urgency: "low" | "medium" | "high";
  urgencyOverridden: boolean;
  isRecurring: boolean;
  lowConfidence: boolean;
  createdAt: Date;
}

interface TaskCardProps {
  task: Task;
  onRefresh: () => void;
}

const URGENCY_STYLES = {
  high: "urgency-high",
  medium: "urgency-medium",
  low: "urgency-low",
};

const URGENCY_LABELS = { high: "Urgent", medium: "Soon", low: "Low" };

const CATEGORY_ICONS: Record<string, string> = {
  school: "🎒",
  medical: "🏥",
  social: "🎉",
  admin: "📋",
  household: "🏠",
  insurance: "🛡️",
  cars: "🚗",
  pets: "🐾",
  finance: "💰",
  general: "✅",
};

function formatDeadline(deadline: Date | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isPast(d)) return `Overdue · ${format(d, "d MMM")}`;
  return format(d, "d MMM");
}

export default function TaskCard({ task, onRefresh }: TaskCardProps) {
  const { members, household } = useHousehold();
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDeadline, setEditDeadline] = useState(
    task.deadline ? format(new Date(task.deadline), "yyyy-MM-dd") : ""
  );

  const utils = trpc.useUtils();

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.listMine.invalidate();
      utils.load.scores.invalidate();
      onRefresh();
    },
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: (_, vars) => {
      utils.tasks.list.invalidate();
      utils.tasks.listMine.invalidate();
      utils.load.scores.invalidate();
      onRefresh();
    },
  });

  const dismissInference = trpc.routing.dismiss.useMutation();
  const { data: dismissedTypes } = trpc.routing.getDismissed.useQuery(
    { householdId: task.householdId },
    { enabled: !!task.householdId }
  );

  const ownerMember = members.find((m) => m.id === task.ownerMemberId);
  const otherMember = members.find((m) => m.id !== task.ownerMemberId);
  const deadlineStr = formatDeadline(task.deadline);
  const isOverdue = task.deadline && isPast(new Date(task.deadline)) && task.status === "open";

  async function markDone() {
    await updateTask.mutateAsync({
      taskId: task.id,
      householdId: task.householdId,
      status: "done",
    });
    toast.success("Task marked as done ✓");
  }

  async function markOpen() {
    await updateTask.mutateAsync({
      taskId: task.id,
      householdId: task.householdId,
      status: "open",
    });
  }

  async function snooze() {
    await updateTask.mutateAsync({
      taskId: task.id,
      householdId: task.householdId,
      status: "snoozed",
    });
    toast.success("Task snoozed — it'll come back soon");
  }

  async function reassign() {
    if (!otherMember) return;
    await updateTask.mutateAsync({
      taskId: task.id,
      householdId: task.householdId,
      ownerMemberId: otherMember.id,
    });
    toast.success(`Reassigned to ${otherMember.displayName}`);
  }

  async function setUrgencyHigh() {
    await updateTask.mutateAsync({
      taskId: task.id,
      householdId: task.householdId,
      urgency: "high",
      urgencyOverridden: true,
    });
    toast.success("Marked as urgent");
  }

  async function saveEdit() {
    await updateTask.mutateAsync({
      taskId: task.id,
      householdId: task.householdId,
      title: editTitle,
      deadline: editDeadline || null,
    });
    setEditOpen(false);
    toast.success("Task updated");
  }

  async function handleDelete() {
    await deleteTask.mutateAsync({ taskId: task.id, householdId: task.householdId });
    // Learn from deletion: if this was an inferred task type, dismiss it
    const inferenceKey = `${task.category}:${task.subject ?? "any"}`;
    const alreadyDismissed = (dismissedTypes ?? []).some(
      (d: any) => d.inferenceType === inferenceKey
    );
    if (!alreadyDismissed) {
      try {
        await dismissInference.mutateAsync({
          householdId: task.householdId,
          inferenceType: inferenceKey,
          label: task.title,
        });
        toast(
          `Got it — I won't suggest tasks like "${task.title}" again. You can re-enable this in Settings.`,
          { duration: 5000 }
        );
      } catch {
        // Dismissal is best-effort; don't block the delete
        toast.success("Task removed");
      }
    } else {
      toast.success("Task removed");
    }
  }

  return (
    <>
      <Card
        className={`shadow-none border transition-all duration-200 ${
          task.status === "done"
            ? "opacity-60 bg-muted/30"
            : isOverdue
            ? "border-orange-200 bg-orange-50/30"
            : "bg-card hover:shadow-sm"
        }`}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-3">
            {/* Done toggle */}
            <button
              onClick={task.status === "done" ? markOpen : markDone}
              className={`mt-0.5 shrink-0 transition-colors ${
                task.status === "done" ? "text-primary" : "text-muted-foreground hover:text-primary"
              }`}
              aria-label={task.status === "done" ? "Mark as open" : "Mark as done"}
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-sm font-medium leading-snug ${
                    task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {CATEGORY_ICONS[task.category] ?? "✅"} {task.title}
                  {task.lowConfidence && (
                    <span className="ml-1.5 inline-flex items-center text-amber-500" title="Review this task">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {task.isRecurring && (
                    <span className="ml-1.5 text-muted-foreground" title="Recurring">
                      <RotateCcw className="w-3 h-3 inline" />
                    </span>
                  )}
                </p>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    {task.status !== "done" && (
                      <DropdownMenuItem onClick={snooze}>
                        <Clock className="w-4 h-4 mr-2" /> Snooze
                      </DropdownMenuItem>
                    )}
                    {task.urgency !== "high" && task.status === "open" && (
                      <DropdownMenuItem onClick={setUrgencyHigh}>
                        <Zap className="w-4 h-4 mr-2" /> Mark as urgent
                      </DropdownMenuItem>
                    )}
                    {otherMember && task.status !== "done" && (
                      <DropdownMenuItem onClick={reassign}>
                        <UserCheck className="w-4 h-4 mr-2" /> Reassign to {otherMember.displayName}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-xs px-1.5 py-0 h-5 ${URGENCY_STYLES[task.urgency]}`}
                >
                  {URGENCY_LABELS[task.urgency]}
                </Badge>
                {deadlineStr && (
                  <span
                    className={`text-xs flex items-center gap-0.5 ${
                      isOverdue ? "text-orange-600 font-medium" : "text-muted-foreground"
                    }`}
                  >
                    <Calendar className="w-3 h-3" />
                    {deadlineStr}
                  </span>
                )}
                {ownerMember && (
                  <span className="text-xs text-muted-foreground">→ {ownerMember.displayName}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deadline</label>
              <Input
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={updateTask.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
