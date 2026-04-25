import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import InputBar from "@/components/InputBar";
import TaskCard from "@/components/TaskCard";
import LoadScoreBar from "@/components/LoadScoreBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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

type TaskView = "household" | "mine" | "partner";

export default function SharedView() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { household, members, myMemberId, setHousehold, setMembers, setMyMemberId } = useHousehold();
  const [identityOpen, setIdentityOpen] = useState(true);
  const [view, setView] = useState<TaskView>("household");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: householdData, isLoading } = trpc.household.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const { data: allTasks, refetch: refetchAll } = trpc.tasks.list.useQuery(
    { householdId: household?.id ?? 0 },
    { enabled: !!household?.id && !identityOpen }
  );

  useEffect(() => {
    if (householdData) {
      setHousehold(householdData.household as any);
      setMembers(householdData.members as any);
    }
  }, [householdData]);

  function selectIdentity(memberId: number) {
    setMyMemberId(memberId);
    setIdentityOpen(false);
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
    refetchAll();
  }

  const myMember = members.find((m) => m.id === myMemberId);
  const partnerMember = members.find((m) => m.id !== myMemberId);

  const openTasks = (allTasks ?? []).filter((t: Task) => t.status === "open");
  const snoozedTasks = (allTasks ?? []).filter((t: Task) => t.status === "snoozed");
  const doneTasks = (allTasks ?? []).filter((t: Task) => t.status === "done");

  function filterByView(tasks: Task[]): Task[] {
    if (view === "mine") return tasks.filter((t) => t.ownerMemberId === myMemberId);
    if (view === "partner") return tasks.filter((t) => t.ownerMemberId !== myMemberId);
    return tasks;
  }

  function sortByUrgencyAndDeadline(tasks: Task[]): Task[] {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) => {
      const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgDiff !== 0) return urgDiff;
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });
  }

  const visibleOpen = sortByUrgencyAndDeadline(filterByView(openTasks));
  const visibleSnoozed = filterByView(snoozedTasks);
  const visibleDone = filterByView(doneTasks).slice(0, 10);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Leaf className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!householdData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-foreground font-medium">Household not found</p>
          <p className="text-sm text-muted-foreground">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Identity dialog — shown on every open */}
      <Dialog open={identityOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-center">
              <Leaf className="w-6 h-6 text-primary mx-auto mb-2" />
              Who are you?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground text-center">
            Select your name to see your personalised view.
          </p>
          <div className="flex flex-col gap-3 py-2">
            {members.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                size="lg"
                onClick={() => selectIdentity(m.id)}
                className="w-full text-base"
              >
                {m.displayName}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Offload</span>
            {household && (
              <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                {household.name}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setIdentityOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1"
          >
            {myMember?.displayName ?? "Switch"}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <LoadScoreBar />
        <InputBar onTasksAdded={handleRefresh} />

        <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
          <TabsList className="w-full">
            <TabsTrigger value="household" className="flex-1">
              Household
              {openTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">
                  {openTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1">
              {myMember?.displayName ?? "Mine"}
              {openTasks.filter((t: Task) => t.ownerMemberId === myMemberId).length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">
                  {openTasks.filter((t: Task) => t.ownerMemberId === myMemberId).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="partner" className="flex-1">
              {partnerMember?.displayName ?? "Partner"}
              {openTasks.filter((t: Task) => t.ownerMemberId !== myMemberId).length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">
                  {openTasks.filter((t: Task) => t.ownerMemberId !== myMemberId).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={view} className="mt-4 space-y-6">
            {visibleOpen.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Open · {visibleOpen.length}
                </h2>
                <div className="space-y-2">
                  {visibleOpen.map((task: Task) => (
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} />
                  ))}
                </div>
              </section>
            )}
            {visibleSnoozed.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Snoozed · {visibleSnoozed.length}
                </h2>
                <div className="space-y-2">
                  {visibleSnoozed.map((task: Task) => (
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} />
                  ))}
                </div>
              </section>
            )}
            {visibleDone.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Done · {visibleDone.length}
                </h2>
                <div className="space-y-2">
                  {visibleDone.map((task: Task) => (
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} />
                  ))}
                </div>
              </section>
            )}
            {visibleOpen.length === 0 && visibleSnoozed.length === 0 && visibleDone.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <div className="text-5xl">🌿</div>
                <p className="text-base font-medium text-foreground">All clear!</p>
                <p className="text-sm text-muted-foreground">Add something above to get started.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
