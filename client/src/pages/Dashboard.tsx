import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useHousehold } from "@/contexts/HouseholdContext";
import InputBar from "@/components/InputBar";
import TaskCard from "@/components/TaskCard";
import LoadScoreBar from "@/components/LoadScoreBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, Share2, LogOut, Settings, Copy, Check } from "lucide-react";
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
  const { user, loading, logout } = useAuth();
  const { household, members, myMemberId, setHousehold, setMembers, setMyMemberId } = useHousehold();
  const [view, setView] = useState<TaskView>("household");
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: householdData, isLoading: householdLoading } = trpc.household.getMine.useQuery(
    undefined,
    { enabled: !!user }
  );

  const { data: allTasks, refetch: refetchAll } = trpc.tasks.list.useQuery(
    { householdId: household?.id ?? 0 },
    { enabled: !!household?.id }
  );

  useEffect(() => {
    if (householdData) {
      setHousehold(householdData.household as any);
      setMembers(householdData.members as any);
      setMyMemberId(householdData.myMemberId);
    }
  }, [householdData]);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user]);

  useEffect(() => {
    if (!householdLoading && !householdData && user) navigate("/onboarding");
  }, [householdLoading, householdData, user]);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
    refetchAll();
  }

  function copyShareLink() {
    if (!household) return;
    const url = `${window.location.origin}/shared/${household.shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied!");
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

  if (loading || householdLoading) {
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
    <div className="min-h-screen bg-background">
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="text-muted-foreground"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Share</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Load score */}
        <LoadScoreBar />

        {/* Input bar */}
        <InputBar onTasksAdded={handleRefresh} />

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
            {/* Open tasks */}
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

            {/* Snoozed tasks */}
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

            {/* Done tasks */}
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

            {/* Empty state */}
            {visibleOpen.length === 0 && visibleSnoozed.length === 0 && visibleDone.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <div className="text-5xl">🌿</div>
                <p className="text-base font-medium text-foreground">All clear!</p>
                <p className="text-sm text-muted-foreground">
                  Add something above to get started.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Share dialog */}
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
    </div>
  );
}
