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
import { Leaf, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  const { household, members, myMemberId, setHousehold, setMembers, setToken, persistIdentity } = useHousehold();
  const [identityOpen, setIdentityOpen] = useState(myMemberId === null);
  const [view, setView] = useState<TaskView>("household");
  const [refreshKey, setRefreshKey] = useState(0);
  const [inputOpen, setInputOpen] = useState(false);

  const { data: householdData, isLoading } = trpc.household.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const { data: allTasks, refetch: refetchAll } = trpc.tasks.list.useQuery(
    { token: token ?? "" },
    { enabled: !!token && !identityOpen }
  );

  useEffect(() => {
    if (token) setToken(token);
  }, [token]);

  useEffect(() => {
    if (householdData) {
      setHousehold(householdData.household as any);
      setMembers(householdData.members as any);
      if (myMemberId !== null) setIdentityOpen(false);
    }
  }, [householdData]);

  function selectIdentity(memberId: number) {
    if (token) persistIdentity(token, memberId);
    setIdentityOpen(false);
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
    refetchAll();
    setInputOpen(false);
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Leaf className="w-6 h-6 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Loading household...</p>
        </div>
      </div>
    );
  }

  if (!householdData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Leaf className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-semibold">Household not found</p>
          <p className="text-sm text-muted-foreground">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-x-hidden">
      {/* ── Decorative background blobs ───────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 0% 0%, oklch(0.88 0.07 165 / 0.4) 0%, transparent 60%),
            radial-gradient(ellipse 50% 35% at 100% 100%, oklch(0.86 0.08 185 / 0.3) 0%, transparent 55%)
          `,
        }}
      />

      {/* ── Identity dialog ───────────────────────────────────── */}
      <Dialog open={identityOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-2 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              Who are you?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground text-center">
            Select your name to see your personalised view.
          </p>
          <div className="flex flex-col gap-2.5 py-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => selectIdentity(m.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/60 bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold group-hover:bg-primary/20 transition-colors">
                  {m.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-foreground">{m.displayName}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Top nav ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-foreground tracking-tight">Offload</span>
              {household && (
                <span className="text-xs text-muted-foreground">{household.name}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIdentityOpen(true)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground border border-border/60 hover:border-primary/30 rounded-full px-3 py-1.5 transition-all bg-card/50 hover:bg-primary/5"
          >
            {myMember?.displayName ?? "Switch"}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-5 space-y-5">
        <LoadScoreBar />

        <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
          <TabsList className="w-full bg-white/60 backdrop-blur-sm border border-border/50 shadow-sm">
            <TabsTrigger value="household" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              Household
              {openTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 bg-primary/10 text-primary border-0">
                  {openTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              {myMember?.displayName ?? "Mine"}
              {openTasks.filter((t: Task) => t.ownerMemberId === myMemberId).length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 bg-primary/10 text-primary border-0">
                  {openTasks.filter((t: Task) => t.ownerMemberId === myMemberId).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="partner" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              {partnerMember?.displayName ?? "Partner"}
              {openTasks.filter((t: Task) => t.ownerMemberId !== myMemberId).length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 bg-primary/10 text-primary border-0">
                  {openTasks.filter((t: Task) => t.ownerMemberId !== myMemberId).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={view} className="mt-4 space-y-6">
            {visibleOpen.length > 0 && (
              <section className="space-y-2.5">
                <div className="section-label">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 inline-block" />
                  Open · {visibleOpen.length}
                </div>
                <div className="space-y-2">
                  {visibleOpen.map((task: Task) => (
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} />
                  ))}
                </div>
              </section>
            )}
            {visibleSnoozed.length > 0 && (
              <section className="space-y-2.5">
                <div className="section-label">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 inline-block" />
                  Snoozed · {visibleSnoozed.length}
                </div>
                <div className="space-y-2">
                  {visibleSnoozed.map((task: Task) => (
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} />
                  ))}
                </div>
              </section>
            )}
            {visibleDone.length > 0 && (
              <section className="space-y-2.5">
                <div className="section-label">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 inline-block" />
                  Done · {visibleDone.length}
                </div>
                <div className="space-y-2">
                  {visibleDone.map((task: Task) => (
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} />
                  ))}
                </div>
              </section>
            )}
            {visibleOpen.length === 0 && visibleSnoozed.length === 0 && visibleDone.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/70 shadow-sm border border-border/50 text-4xl backdrop-blur-sm">
                  🌿
                </div>
                <p className="text-base font-semibold text-foreground">All clear!</p>
                <p className="text-sm text-muted-foreground">Tap + to add something.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Floating pill CTA ─────────────────────────────────── */}
      <button
        onClick={() => setInputOpen(true)}
        className="fab-pill fixed bottom-6 right-1/2 translate-x-1/2 sm:right-6 sm:translate-x-0 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full text-primary-foreground active:scale-95 transition-all text-sm font-semibold tracking-wide"
        aria-label="Add task or event"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Offload it
      </button>

      {/* ── Input bottom sheet ────────────────────────────────── */}
      <Dialog open={inputOpen} onOpenChange={setInputOpen}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-t-2xl sm:rounded-2xl">
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <DialogHeader className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold">What's on your mind?</DialogTitle>
              <button
                onClick={() => setInputOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="px-5 pb-6">
            <InputBar onTasksAdded={handleRefresh} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
