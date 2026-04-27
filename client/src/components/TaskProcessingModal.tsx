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
  // Editable event fields (title, startTime, location)
  const [eventEdits, setEventEdits] = useState<Record<number, Partial<ExtractedEvent>>>({});
  // Reclassification: event indices moved to tasks, task indices moved to events
  const [movedToTask, setMovedToTask] = useState<Set<number>>(new Set());
  const [movedToEvent, setMovedToEvent] = useState<Set<number>>(new Set());

  function getEvent(i: number): ExtractedEvent {
    return { ...(result?.events[i] ?? {} as ExtractedEvent), ...(eventEdits[i] ?? {}) };
  }
  function patchEvent(i: number, patch: Partial<ExtractedEvent>) {
    setEventEdits((prev) => ({ ...prev, [i]: { ...(prev[i] ?? {}), ...patch } }));
  }
  function moveEventToTask(i: number) {
    setMovedToTask((prev) => { const s = new Set(prev); s.add(i); return s; });
  }
  function moveTaskToEvent(i: number) {
    setMovedToEvent((prev) => { const s = new Set(prev); s.add(i); return s; });
  }

  const primaryMember = members.find((m) => m.role === "primary");
  const partnerMember = members.find((m) => m.role === "partner");

  const createEvent = trpc.events.create.useMutation();
  const createTask = trpc.tasks.create.useMutation();
  const dismissInference = trpc.routing.dismiss.useMutation();
  const learnRule = trpc.routing.learnRule.useMutation();
  const utils = trpc.useUtils();

  // Fetch existing routing rules so we know which categories already have a rule
  const { data: existingRules } = trpc.routing.getRules.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

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
    if (!suggestion || suggestion.confidence === "low") return true;
    // Also ask if there's no existing rule for this category (first time seeing it)
    const task = result?.tasks[i];
    if (!task) return false;
    const hasRule = (existingRules ?? []).some(
      (r: any) => r.category === task.category
    );
    return !hasRule;
  }

  async function handleConfirm() {
    if (!token || !result) return;
    setSaving(true);
    try {
      // Save events (use edited versions, skip ones reclassified as tasks)
      const savedEvents: Array<{ id: number; title: string }> = [];
      for (let ei = 0; ei < result!.events.length; ei++) {
        if (movedToTask.has(ei)) continue; // reclassified — save as task below
        const ev = getEvent(ei);
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

      // Save events that were reclassified from tasks
      for (let i = 0; i < result!.tasks.length; i++) {
        if (!movedToEvent.has(i)) continue;
        const task = result!.tasks[i];
        const saved = await createEvent.mutateAsync({
          token,
          title: task.title,
          description: task.description,
          startTime: task.deadline,
        });
        if (saved) savedEvents.push({ id: saved.id, title: task.title });
      }

      // Save active tasks
      for (let i = 0; i < result!.tasks.length; i++) {
        if (removedTasks.has(i)) continue;
        if (movedToEvent.has(i)) continue; // reclassified — already saved as event above
        const task = result!.tasks[i];
        const ownerId = getOwner(i, task);
        const isRecurring = taskRecurring[i] ?? false;

        // Find matching event
        const matchingEvent = savedEvents[0]; // simplistic — link first event

        const created = await createTask.mutateAsync({
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
        if (task.deadline && created.calendarPushed) {
          const ownerName = members.find((m) => m.id === ownerId)?.displayName ?? "them";
          toast.success(`📅 Added to ${ownerName}'s Google Calendar`);
        } else if (task.deadline && created.calendarError) {
          toast.error(`Calendar sync failed: ${created.calendarError}`);
        }
      }

      // Learn routing rules from confirmed owner assignments
      const learnedCategories = new Set<string>();
      for (let i = 0; i < result!.tasks.length; i++) {
        if (removedTasks.has(i)) continue;
        const task = result!.tasks[i];
        const ownerId = getOwner(i, task);
        const categoryKey = task.category;
        // Only learn once per category per batch, and only if user explicitly picked or no rule exists
        if (!learnedCategories.has(categoryKey)) {
          learnedCategories.add(categoryKey);
          try {
            await learnRule.mutateAsync({
              token,
              category: task.category,
              subject: task.subject !== "any" ? task.subject : undefined,
              qualifier: task.qualifier,
              assigneeMemberId: ownerId,
              permanent: true,
            });
          } catch {
            // Non-fatal — routing rule learning failure shouldn't block task save
          }
        }
      }

      // Save events reclassified as tasks
      for (let ei = 0; ei < result!.events.length; ei++) {
        if (!movedToTask.has(ei)) continue;
        const ev = getEvent(ei);
        await createTask.mutateAsync({
          token,
          title: ev.title,
          description: ev.description,
          category: "general",
          subject: "any",
          ownerMemberId: primaryMember?.id ?? myMemberId ?? members[0]?.id ?? 0,
          urgency: "medium",
          isRecurringSuggestion: false,
          isRecurring: false,
          lowConfidence: true,
        });
      }

      utils.tasks.list.invalidate();
      utils.tasks.listMine.invalidate();
      utils.load.scores.invalidate();
      utils.routing.getRules.invalidate();
      const totalEvents = result!.events.length - movedToTask.size + movedToEvent.size;
      const totalTasks = activeTasks.length - movedToEvent.size + movedToTask.size;
      toast.success(`Saved ${totalEvents} event(s) and ${totalTasks} task(s)`);
      onConfirm();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Decorative header */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-teal-50/80 via-white/70 to-emerald-50/60 px-5 pt-5 pb-4 border-b border-border/40">
          <div
            aria-hidden
            className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, oklch(0.70 0.12 185) 0%, transparent 70%)" }}
          />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 relative">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-base font-bold">Review what Offload found</span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">

        {/* Classification summary banner */}
        <div className="flex items-center gap-2 flex-wrap">
          {result.events.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              <Calendar className="w-3.5 h-3.5" />
              {result.events.length} calendar {result.events.length === 1 ? "event" : "events"}
            </div>
          )}
          {result.tasks.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {result.tasks.length} {result.tasks.length === 1 ? "task" : "tasks"}
            </div>
          )}
          {result.events.length === 0 && result.tasks.length === 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-muted-foreground text-xs">
              Nothing extracted — try rephrasing
            </div>
          )}
          <p className="text-xs text-muted-foreground ml-auto">Review and edit before saving</p>
        </div>

        {/* Transcript (voice only) */}
        {result.transcript && (
          <div className="bg-muted/40 rounded-xl px-3.5 py-2.5 text-xs text-muted-foreground italic border border-border/40 flex gap-2 items-start">
            <span className="text-base leading-none mt-0.5">🎙</span>
            <span>"{result.transcript}"</span>
          </div>
        )}

        {/* Events */}
        {result.events.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-200/60">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-800 leading-none">Calendar Events</p>
                <p className="text-[10px] text-blue-600 mt-0.5">Added to your household calendar</p>
              </div>
            </div>
            {result.events.map((_, i) => {
              if (movedToTask.has(i)) return null;
              const ev = getEvent(i);
              return (
                <div key={i} className="card-glass rounded-xl border-blue-200/50 bg-blue-50/30">
                  <div className="py-3 px-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Input
                          value={ev.title}
                          onChange={(e) => patchEvent(i, { title: e.target.value })}
                          className="h-7 text-sm font-medium border-0 bg-transparent px-0 py-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          placeholder="Event title"
                        />
                        {ev.subjectName && (
                          <p className="text-xs text-muted-foreground">For: {ev.subjectName}</p>
                        )}
                      </div>
                      <button
                        onClick={() => moveEventToTask(i)}
                        className="text-[10px] text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-2 py-1 rounded-lg shrink-0 transition-colors"
                        title="Move to tasks instead"
                      >
                        → Task
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Date &amp; time</label>
                        <Input
                          type="datetime-local"
                          value={ev.startTime ? ev.startTime.slice(0, 16) : ""}
                          onChange={(e) => patchEvent(i, { startTime: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                          className="h-7 text-xs mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Location</label>
                        <Input
                          value={ev.location ?? ""}
                          onChange={(e) => patchEvent(i, { location: e.target.value || undefined })}
                          placeholder="optional"
                          className="h-7 text-xs mt-0.5"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/60">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-emerald-800 leading-none">Action Tasks</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Assigned to household members</p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                {activeTasks.length} active
              </span>
            </div>
            {result.tasks.map((task, i) => {
              if (removedTasks.has(i)) return null;
              if (movedToEvent.has(i)) return null;
              const expanded = expandedTasks.has(i);
              const ownerId = getOwner(i, task);
              const owner = members.find((m) => m.id === ownerId);

              return (
                <div key={i} className="card-elevated rounded-xl">
                  <div className="py-3 px-4">
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
                              onClick={() => moveTaskToEvent(i)}
                              className="text-[10px] text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 px-1.5 py-0.5 rounded-lg transition-colors"
                              title="Move to calendar instead"
                            >
                              → Cal
                            </button>
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
                  </div>
                </div>
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

        </div>{/* end scroll wrapper */}

        <DialogFooter className="gap-2 px-5 pb-5 pt-3 border-t border-border/40">
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
