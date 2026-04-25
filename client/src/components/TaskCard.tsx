import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
  Circle,
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

const URGENCY_LEFT_BORDER: Record<string, string> = {
  high: "border-l-red-400",
  medium: "border-l-amber-400",
  low: "border-l-primary/20",
};

const URGENCY_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

const URGENCY_LABELS: Record<string, string> = { high: "Urgent", medium: "Soon", low: "Low" };

const URGENCY_BG: Record<string, string> = {
  high: "bg-red-50/60",
  medium: "bg-amber-50/40",
  low: "",
};

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

function ownerInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function TaskCard({ task, onRefresh }: TaskCardProps) {
  const { members, token } = useHousehold();
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
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.listMine.invalidate();
      utils.load.scores.invalidate();
      onRefresh();
    },
  });

  const dismissInference = trpc.routing.dismiss.useMutation();
  const { data: dismissedTypes } = trpc.routing.getDismissed.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const ownerMember = members.find((m) => m.id === task.ownerMemberId);
  const otherMember = members.find((m) => m.id !== task.ownerMemberId);
  const deadlineStr = formatDeadline(task.deadline);
  const isOverdue =
    task.deadline && isPast(new Date(task.deadline)) && task.status === "open";

  async function markDone() {
    await updateTask.mutateAsync({ taskId: task.id, token: token ?? "", status: "done" });
    toast.success("Done ✓");
  }

  async function markOpen() {
    await updateTask.mutateAsync({ taskId: task.id, token: token ?? "", status: "open" });
  }

  async function snooze() {
    await updateTask.mutateAsync({ taskId: task.id, token: token ?? "", status: "snoozed" });
    toast.success("Snoozed — it'll come back soon");
  }

  async function reassign() {
    if (!otherMember) return;
    await updateTask.mutateAsync({
      taskId: task.id,
      token: token ?? "",
      ownerMemberId: otherMember.id,
    });
    toast.success(`Reassigned to ${otherMember.displayName}`);
  }

  async function setUrgencyHigh() {
    await updateTask.mutateAsync({
      taskId: task.id,
      token: token ?? "",
      urgency: "high",
      urgencyOverridden: true,
    });
    toast.success("Marked as urgent");
  }

  async function saveEdit() {
    await updateTask.mutateAsync({
      taskId: task.id,
      token: token ?? "",
      title: editTitle,
      deadline: editDeadline || null,
    });
    setEditOpen(false);
    toast.success("Task updated");
  }

  async function handleDelete() {
    await deleteTask.mutateAsync({ taskId: task.id, token: token ?? "" });
    const inferenceKey = `${task.category}:${task.subject ?? "any"}`;
    const alreadyDismissed = (dismissedTypes ?? []).some(
      (d: any) => d.inferenceType === inferenceKey
    );
    if (!alreadyDismissed) {
      try {
        await dismissInference.mutateAsync({
          token: token ?? "",
          inferenceType: inferenceKey,
          label: task.title,
        });
        toast(
          `Got it — I won't suggest tasks like "${task.title}" again. Re-enable in Settings.`,
          { duration: 5000 }
        );
      } catch {
        toast.success("Task removed");
      }
    } else {
      toast.success("Task removed");
    }
  }

  const isDone = task.status === "done";

  return (
    <>
      <div
        className={`
          group relative rounded-xl border-l-4 transition-all duration-200
          ${isDone
            ? "opacity-50 bg-card border border-border"
            : `card-elevated hover:-translate-y-0.5 hover:shadow-[0_2px_16px_oklch(0_0_0/0.10),0_0_0_1px_oklch(0.88_0.018_175/0.5)] ${URGENCY_BG[task.urgency]}`
          }
          ${isOverdue && !isDone ? "border-orange-200 bg-orange-50/30" : ""}
          ${URGENCY_LEFT_BORDER[task.urgency]}
        `}
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          {/* Check button */}
          <button
            onClick={isDone ? markOpen : markDone}
            className={`mt-0.5 shrink-0 transition-all ${
              isDone
                ? "text-primary"
                : "text-muted-foreground/30 hover:text-primary hover:scale-110"
            }`}
            aria-label={isDone ? "Mark as open" : "Mark as done"}
          >
            {isDone ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Circle className="w-5 h-5" />
            )}
          </button>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-sm font-medium leading-snug ${
                  isDone ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                <span className="mr-1.5 text-base">{CATEGORY_ICONS[task.category] ?? "✅"}</span>
                {task.title}
                {task.lowConfidence && (
                  <span
                    className="ml-1.5 inline-flex items-center text-amber-500"
                    title="AI wasn't fully confident — worth reviewing"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                )}
                {task.isRecurring && (
                  <span className="ml-1.5 text-muted-foreground/60" title="Recurring">
                    <RotateCcw className="w-3 h-3 inline" />
                  </span>
                )}
              </p>

              {/* Actions menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="shrink-0 text-muted-foreground/30 hover:text-foreground p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:bg-muted/60">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 shadow-lg">
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
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Urgency dot + label */}
              {task.urgency !== "low" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${URGENCY_DOT[task.urgency]}`} />
                  {URGENCY_LABELS[task.urgency]}
                </span>
              )}

              {/* Deadline */}
              {deadlineStr && (
                <span
                  className={`text-xs flex items-center gap-1 ${
                    isOverdue && !isDone
                      ? "text-orange-600 font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  {deadlineStr}
                </span>
              )}

              {/* Owner chip — pill with initials */}
              {ownerMember && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-full border border-border/40">
                  <span className="w-3.5 h-3.5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold leading-none">
                    {ownerInitials(ownerMember.displayName)}
                  </span>
                  {ownerMember.displayName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

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
