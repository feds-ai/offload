import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import InputBar from "@/components/InputBar";
import TaskCard from "@/components/TaskCard";
import LoadScoreBar from "@/components/LoadScoreBar";
import ResponsibilitiesPanel from "@/components/ResponsibilitiesPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Share2, Settings, Copy, Check, User, Plus, X } from "lucide-react";
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

  const { data: householdData, isLoading: householdLoading } = trpc.household.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const { data: allTasks, refetch: refetchAll } = trpc.tasks.list.useQuery(
    { token: token ?? "" },
    { enabled: !!token && !!household }
  );

  useEffect(() => {
    if (householdData) {
      setHousehold(householdData.household as any);
      setMembers(householdData.members as any);
    }
  }, [householdData]);

  useEffect(() => {
    if (!token) navigate("/onboarding");
  }, [token]);

  useEffect(() => {
    if (needsIdentityCheck) setIdentityOpen(true);
  }, [needsIdentityCheck]);

  function handleRefresh() {
    refetchAll();
    setInputOpen(false);
  }

  function handleReassign() {
    refetchAll();
    setView("household");
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
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden className="animate-pulse">
              <path d="M7 22 Q10 27 16 28 Q22 27 25 22 Z" fill="oklch(0.48 0.12 185)" opacity={0.85} />
              <rect x="8" y="18" width="16" height="5" rx="1.5" fill="oklch(0.48 0.12 185)" opacity={0.7} />
              <line x1="16" y1="18" x2="16" y2="8" stroke="oklch(0.48 0.12 185)" strokeWidth="1.5" strokeLinecap="round" opacity={0.9} />
              <path d="M16 8 L23 11 L16 14 Z" fill="oklch(0.48 0.12 185)" opacity={0.9} />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">Loading your household...</p>
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
            radial-gradient(ellipse 50% 35% at 100% 100%, oklch(0.86 0.08 185 / 0.3) 0%, transparent 55%),
            radial-gradient(ellipse 40% 30% at 70% 30%, oklch(0.90 0.05 155 / 0.2) 0%, transparent 50%)
          `,
        }}
      />

      {/* ── Top nav ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm overflow-hidden">
              {/* Boat icon */}
              <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden>
                {/* Water */}
                <path d="M2 22 Q8 19 16 22 Q24 25 30 22 L30 28 L2 28 Z" fill="white" opacity={0.35} />
                {/* Hull */}
                <path d="M7 22 Q10 27 16 28 Q22 27 25 22 Z" fill="white" opacity={0.85} />
                {/* Deck */}
                <rect x="8" y="18" width="16" height="5" rx="1.5" fill="white" opacity={0.7} />
                {/* Mast */}
                <line x1="16" y1="18" x2="16" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity={0.9} />
                {/* Flag */}
                <path d="M16 8 L23 11 L16 14 Z" fill="white" opacity={0.9} />
              </svg>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-foreground tracking-tight">Offload</span>
              {myMember && (
                <span className="text-xs text-muted-foreground">{myMember.displayName}'s view</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="text-muted-foreground h-8 px-2.5 text-xs gap-1.5 hover:bg-primary/8"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/settings")}
              className="text-muted-foreground h-8 w-8 p-0 hover:bg-primary/8"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Load score */}
        <LoadScoreBar />

        {/* Ongoing responsibilities */}
        <ResponsibilitiesPanel />

        {/* View tabs */}
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
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} onReassign={handleReassign} />
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
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} onReassign={handleReassign} />
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
                    <TaskCard key={task.id} task={task} onRefresh={handleRefresh} onReassign={handleReassign} />
                  ))}
                </div>
              </section>
            )}

            {visibleOpen.length === 0 && visibleSnoozed.length === 0 && visibleDone.length === 0 && (
              <div className="text-center py-14 space-y-4">
                {/* Calm water boat illustration */}
                <div className="flex justify-center">
                  <svg viewBox="0 0 160 100" width="160" height="100" aria-hidden>
                    {/* Calm water */}
                    <path d="M0 72 Q40 66 80 72 Q120 78 160 72 L160 100 L0 100 Z" fill="oklch(0.62 0.10 195)" opacity={0.3} />
                    <path d="M0 78 Q40 74 80 78 Q120 82 160 78 L160 100 L0 100 Z" fill="oklch(0.62 0.10 195)" opacity={0.18} />
                    {/* Hull */}
                    <path d="M42 72 Q50 84 80 86 Q110 84 118 72 Z" fill="oklch(0.55 0.09 40)" opacity={0.85} />
                    {/* Deck */}
                    <rect x="44" y="65" width="72" height="8" rx="2.5" fill="oklch(0.65 0.09 45)" opacity={0.9} />
                    {/* Cabin */}
                    <rect x="60" y="52" width="40" height="14" rx="3" fill="white" opacity={0.85} />
                    {/* Cabin windows */}
                    <rect x="66" y="56" width="10" height="7" rx="2" fill="oklch(0.62 0.10 195)" opacity={0.55} />
                    <rect x="80" y="56" width="10" height="7" rx="2" fill="oklch(0.62 0.10 195)" opacity={0.55} />
                    {/* Mast */}
                    <line x1="80" y1="52" x2="80" y2="26" stroke="oklch(0.45 0.07 40)" strokeWidth="2.5" strokeLinecap="round" />
                    {/* Flag */}
                    <path d="M80 26 L100 32 L80 38 Z" fill="oklch(0.55 0.14 20)" opacity={0.85} />
                    {/* Bunting */}
                    <path d="M80 26 Q95 30 110 26" fill="none" stroke="oklch(0.55 0.14 20)" strokeWidth="1" opacity={0.5} strokeDasharray="3 3" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-foreground">
                  {view === "mine"
                    ? "Your deck is clear ⛵"
                    : view === "partner"
                    ? `${partnerMember?.displayName ?? "Partner"} is sailing smoothly`
                    : "Calm waters!"}
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

      {/* ── Share dialog ──────────────────────────────────────── */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share with your partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Send this link to your partner so they can access your shared household on their device.
            </p>
            {household && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border border-border/60">
                <code className="text-xs text-foreground flex-1 truncate">
                  {window.location.origin}/shared/{household.shareToken}
                </code>
                <button
                  onClick={copyShareLink}
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors p-1"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
            <Button onClick={copyShareLink} className="w-full gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Identity check dialog ─────────────────────────────── */}
      <Dialog open={identityOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Who are you?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Select your name so Offload knows whose view to show you.
            </p>
            <div className="space-y-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (!token) return;
                    persistIdentity(token, m.id);
                    setIdentityOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/60 bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold group-hover:bg-primary/20 transition-colors">
                    {m.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-foreground">{m.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
