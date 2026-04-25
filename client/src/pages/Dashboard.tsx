import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import InputBar from "@/components/InputBar";
import TaskCard from "@/components/TaskCard";
import LoadScoreBar from "@/components/LoadScoreBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, Share2, Settings, Copy, Check, User, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TaskView = "household" | "mine" | "partner";

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

export default function Dashboard() {
  const [, navigate] = useLocation();
  const {
    household,
    members,
    myMemberId,
    token,
    setHousehold,
    setMembers,
    persistIdentity,
    needsIdentityCheck,
    myMember,
  } = useHousehold();
  const [view, setView] = useState<TaskView>("household");
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);

  // Load household data from token
  const { data: householdData, isLoading: householdLoading } = trpc.household.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const { data: allTasks, refetch: refetchAll } = trpc.tasks.list.useQuery(
    { token: token ?? "" },
    { enabled: !!token && !!household }
  );

  // Sync household data into context
  useEffect(() => {
    if (householdData) {
      setHousehold(householdData.household as any);
      setMembers(householdData.members as any);
    }
  }, [householdData]);

  // Redirect to onboarding if no token
  useEffect(() => {
    if (!token) navigate("/onboarding");
  }, [token]);

  // Show identity check if needed
  useEffect(() => {
    if (needsIdentityCheck) setIdentityOpen(true);
  }, [needsIdentityCheck]);

  function handleRefresh() {
    refetchAll();
    setInputOpen(false);
  }

  function copyShareLink() {
    if (!household) return;
    const url = `${window.location.origin}/shared/${household.shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied!");
  }

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

  if (!token || householdLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Leaf className="w-8 h-8 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading your household...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Brand + identity */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-foreground tracking-tight">Offload</span>
              {myMember && (
                <span className="text-xs text-muted-foreground">{myMember.displayName}'s view</span>
              )}
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="text-muted-foreground h-8 px-2.5 text-xs gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/settings")}
              className="text-muted-foreground h-8 w-8 p-0"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Load score — always visible at the top */}
        <LoadScoreBar />

        {/* View tabs */}
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
                <div className="text-5xl">
                  {view === "mine" ? "🌱" : view === "partner" ? "✨" : "🌿"}
                </div>
                <p className="text-base font-medium text-foreground">
                  {view === "mine"
                    ? "Nothing on your plate"
                    : view === "partner"
                    ? `${partnerMember?.displayName ?? "Partner"} is all clear`
                    : "All clear!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {view === "household"
                    ? "Tap + to add your first task or event."
                    : view === "mine"
                    ? "Your tasks will appear here once added."
                    : "Their tasks will appear here once assigned."}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Floating pill CTA ─────────────────────────────────── */}
      <button
        onClick={() => setInputOpen(true)}
        className="fixed bottom-6 right-1/2 translate-x-1/2 sm:right-6 sm:translate-x-0 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 active:scale-95 transition-all text-sm font-semibold tracking-wide"
        aria-label="Add task or event"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Offload it
      </button>

      {/* ── Input bottom sheet ────────────────────────────────── */}
      <Dialog open={inputOpen} onOpenChange={setInputOpen}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-t-2xl sm:rounded-2xl">
          {/* Drag handle for mobile */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-border/50">
            <h2 className="font-semibold text-foreground">Add to Offload</h2>
            <button
              onClick={() => setInputOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 py-4">
            <InputBar onTasksAdded={handleRefresh} />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Share dialog ─────────────────────────────────────── */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share with {partnerMember?.displayName ?? "your partner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Share this link with your partner. They'll be asked who they are when they open it.
              Both of you have full access to view and manage tasks.
            </p>
            {household && (
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                <span className="flex-1 text-xs text-foreground font-mono truncate">
                  {window.location.origin}/shared/{household.shareToken}
                </span>
                <button
                  onClick={copyShareLink}
                  className="text-primary hover:text-primary/80 shrink-0"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          <Button onClick={copyShareLink} className="w-full">
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Identity check dialog */}
      <Dialog open={identityOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Who are you?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pick your name so Offload knows whose view to show.
          </p>
          <div className="space-y-2 pt-2">
            {members.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={() => {
                  if (token) persistIdentity(token, m.id);
                  setIdentityOpen(false);
                }}
              >
                <span className="text-lg">{m.role === "primary" ? "🌿" : "🌱"}</span>
                {m.displayName}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
