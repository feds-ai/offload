import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gift,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  X,
  Sparkles,
} from "lucide-react";
import { useHousehold } from "@/contexts/HouseholdContext";

interface ExtractedEvent {
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  subjectName?: string;
}

interface ExtractedTask {
  title: string;
  description?: string;
  category: string;
  subject: string;
  qualifier?: string;
  deadline?: string;
  urgency: "low" | "medium" | "high";
  isRecurringSuggestion: boolean;
  lowConfidence: boolean;
  inferenceType?: string;
}

interface ExtractionResult {
  events: ExtractedEvent[];
  tasks: ExtractedTask[];
  birthdayPresents?: string[];
  recurrencePrompt?: string;
  transcript?: string;
}

interface TaskProcessingModalProps {
  open: boolean;
  onClose: () => void;
  result: ExtractionResult | null;
  onConfirm: () => void;
}

const URGENCY_STYLES = {
  high: "urgency-high",
  medium: "urgency-medium",
  low: "urgency-low",
};

const CATEGORY_ICONS: Record<string, string> = {
  school: "🎒", medical: "🏥", social: "🎉", admin: "📋",
  household: "🏠", insurance: "🛡️", cars: "🚗", pets: "🐾",
  finance: "💰", general: "✅",
};

export default function TaskProcessingModal({
  open,
  onClose,
  result,
  onConfirm,
}: TaskProcessingModalProps) {
  const { household, members, myMemberId, token } = useHousehold();
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [removedTasks, setRemovedTasks] = useState<Set<number>>(new Set());
  const [taskOwners, setTaskOwners] = useState<Record<number, number>>({});
  const [taskRecurring, setTaskRecurring] = useState<Record<number, boolean>>({});
  const [showPresents, setShowPresents] = useState(true);
  const [saving, setSaving] = useState(false);

  const primaryMember = members.find((m) => m.role === "primary");
  const partnerMember = members.find((m) => m.role === "partner");

  const createEvent = trpc.events.create.useMutation();
  const createTask = trpc.tasks.create.useMutation();
  const dismissInference = trpc.routing.dismiss.useMutation();
  const utils = trpc.useUtils();

  // Fetch routing suggestions for each task
  const routingSuggestions = trpc.routing.suggestBatch.useQuery(
    {
      token: token ?? "",
      tasks: (result?.tasks ?? []).map((t, i) => ({
        index: i,
        title: t.title,
        category: t.category,
        subject: t.subject,
        qualifier: t.qualifier,
      })),
    },
    { enabled: !!token && !!result && result.tasks.length > 0 }
  );

  const activeTasks = result ? result.tasks.filter((_, i) => !removedTasks.has(i)) : [];

  if (!result || !token) return null;

  function toggleExpand(i: number) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function removeTask(i: number) {
    setRemovedTasks((prev) => { const s = new Set(prev); s.add(i); return s; });
  }

  function getOwner(i: number, task: ExtractedTask): number {
    if (taskOwners[i] !== undefined) return taskOwners[i];
    // Use AI routing suggestion if available
    const suggestion = routingSuggestions.data?.find((s) => s.index === i);
    if (suggestion?.memberId) return suggestion.memberId;
    // Default to primary member
    return primaryMember?.id ?? myMemberId ?? members[0]?.id ?? 0;
  }

  function isRoutingUnknown(i: number): boolean {
    const suggestion = routingSuggestions.data?.find((s) => s.index === i);
    return !suggestion || suggestion.confidence === "low";
  }

  async function handleConfirm() {
    if (!token || !result) return;
    setSaving(true);
    try {
      // Save events
      const savedEvents: Array<{ id: number; title: string }> = [];
      for (const ev of result!.events) {
        const saved = await createEvent.mutateAsync({
          token,
          title: ev.title,
          description: ev.description,
          location: ev.location,
          startTime: ev.startTime,
          endTime: ev.endTime,
          subjectName: ev.subjectName,
        });
        if (saved) savedEvents.push({ id: saved.id, title: ev.title });
      }

      // Save active tasks
      for (let i = 0; i < result!.tasks.length; i++) {
        if (removedTasks.has(i)) continue;
        const task = result!.tasks[i];
        const ownerId = getOwner(i, task);
        const isRecurring = taskRecurring[i] ?? false;

        // Find matching event
        const matchingEvent = savedEvents[0]; // simplistic — link first event

        await createTask.mutateAsync({
          token,
          eventId: matchingEvent?.id,
          title: task.title,
          description: task.description,
          category: task.category,
          subject: task.subject,
          qualifier: task.qualifier,
          ownerMemberId: ownerId,
          deadline: task.deadline,
          urgency: task.urgency,
          isRecurringSuggestion: task.isRecurringSuggestion,
          isRecurring,
          lowConfidence: task.lowConfidence,
        });
      }

      utils.tasks.list.invalidate();
      utils.tasks.listMine.invalidate();
      utils.load.scores.invalidate();
      toast.success(`Saved ${result!.events.length} event(s) and ${activeTasks.length} task(s)`);
      onConfirm();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Review what Offload found
          </DialogTitle>
        </DialogHeader>

        {/* Transcript (voice only) */}
        {result.transcript && (
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground italic">
            "{result.transcript}"
          </div>
        )}

        {/* Events */}
        {result.events.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Events → both calendars
            </p>
            {result.events.map((ev, i) => (
              <Card key={i} className="border-primary/20 bg-primary/5 shadow-none">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{ev.title}</p>
                      {ev.startTime && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(ev.startTime).toLocaleString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {ev.location ? ` · ${ev.location}` : ""}
                        </p>
                      )}
                      {ev.subjectName && (
                        <p className="text-xs text-muted-foreground">For: {ev.subjectName}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Birthday presents */}
        {result.birthdayPresents && result.birthdayPresents.length > 0 && showPresents && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Gift className="w-3.5 h-3.5" /> Present ideas
              </p>
              <button onClick={() => setShowPresents(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.birthdayPresents.map((idea, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {idea}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        {result.tasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tasks ({activeTasks.length} active)
            </p>
            {result.tasks.map((task, i) => {
              if (removedTasks.has(i)) return null;
              const expanded = expandedTasks.has(i);
              const ownerId = getOwner(i, task);
              const owner = members.find((m) => m.id === ownerId);

              return (
                <Card key={i} className="shadow-none border-border">
                  <CardContent className="py-3 px-4">
                    {/* Compact row */}
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0 mt-0.5">
                        {CATEGORY_ICONS[task.category] ?? "✅"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {task.title}
                            {task.lowConfidence && (
                              <span className="ml-1.5 text-amber-500" title="Review this">
                                <AlertTriangle className="w-3.5 h-3.5 inline" />
                              </span>
                            )}
                            {task.isRecurringSuggestion && (
                              <span className="ml-1.5 text-muted-foreground" title="Sounds recurring">
                                <RotateCcw className="w-3 h-3 inline" />
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleExpand(i)}
                              className="text-muted-foreground hover:text-foreground p-0.5"
                            >
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => removeTask(i)}
                              className="text-muted-foreground hover:text-destructive p-0.5"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-xs px-1.5 py-0 h-5 ${URGENCY_STYLES[task.urgency]}`}
                          >
                            {task.urgency}
                          </Badge>
                          {task.deadline && (
                            <span className="text-xs text-muted-foreground">
                              Due {new Date(task.deadline).toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            → {owner?.displayName ?? "Unassigned"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* "Who should handle this?" prompt for low-confidence routing */}
                    {isRoutingUnknown(i) && !removedTasks.has(i) && taskOwners[i] === undefined && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <p className="text-xs text-amber-800 font-medium">Who should handle this?</p>
                        <div className="flex gap-2 mt-1.5">
                          {members.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => setTaskOwners((prev) => ({ ...prev, [i]: m.id }))}
                              className="px-2.5 py-1 rounded text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-100 transition-all"
                            >
                              {m.displayName}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expanded controls */}
                    {expanded && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        {/* Owner selector */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Assign to</p>
                          <div className="flex gap-2">
                            {members.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => setTaskOwners((prev) => ({ ...prev, [i]: m.id }))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  ownerId === m.id
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                                }`}
                              >
                                {m.displayName}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Recurrence */}
                        {task.isRecurringSuggestion && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <p className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
                              <RotateCcw className="w-3.5 h-3.5" />
                              This sounds like a recurring task. Mark as recurring?
                            </p>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => setTaskRecurring((prev) => ({ ...prev, [i]: true }))}
                                className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                                  taskRecurring[i]
                                    ? "bg-amber-600 text-white border-amber-600"
                                    : "bg-transparent text-amber-700 border-amber-300 hover:bg-amber-100"
                                }`}
                              >
                                Yes, recurring
                              </button>
                              <button
                                onClick={() => setTaskRecurring((prev) => ({ ...prev, [i]: false }))}
                                className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                                  taskRecurring[i] === false
                                    ? "bg-amber-600 text-white border-amber-600"
                                    : "bg-transparent text-amber-700 border-amber-300 hover:bg-amber-100"
                                }`}
                              >
                                Just this once
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {result.events.length === 0 && result.tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Nothing was extracted from this input.</p>
            <p className="text-xs mt-1">Try adding more detail or context.</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || (result.events.length === 0 && activeTasks.length === 0)}
          >
            {saving ? "Saving..." : `Save ${result.events.length + activeTasks.length} item(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
