import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useHousehold } from "@/contexts/HouseholdContext";

const CATEGORIES = [
  { id: "school", label: "School & Education", icon: "🎒" },
  { id: "medical", label: "Medical & Health", icon: "🏥" },
  { id: "social", label: "Social Events & Parties", icon: "🎉" },
  { id: "admin", label: "Admin & Paperwork", icon: "📋" },
  { id: "household", label: "Household & Home", icon: "🏠" },
  { id: "insurance", label: "Insurance", icon: "🛡️" },
  { id: "cars", label: "Cars & Transport", icon: "🚗" },
  { id: "pets", label: "Pets", icon: "🐾" },
  { id: "finance", label: "Finance & Bills", icon: "💰" },
  { id: "general", label: "General Tasks", icon: "✅" },
];

type Assignment = "primary" | "partner" | "ask";

const STEP_META = [
  { emoji: "👋", title: "Welcome to Offload", subtitle: "Let's set up your household. Who are the two main carers?" },
  { emoji: "🗓️", title: "Your weekly rhythm", subtitle: "Describe your regular weekly schedule in plain language. Offload will use this to infer prep reminders automatically." },
  { emoji: "⚖️", title: "Who handles what?", subtitle: "Set default ownership for each area. You can always override individual tasks." },
  { emoji: "✏️", title: "Any exceptions?", subtitle: "Describe any nuances to the rules above. Offload will learn the rest over time." },
];

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { setHousehold, setMembers, persistIdentity } = useHousehold();

  const [step, setStep] = useState(1);
  const [primaryName, setPrimaryName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [rhythmText, setRhythmText] = useState("");
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.id, "ask"]))
  );
  const [exceptionsText, setExceptionsText] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [primaryMemberId, setPrimaryMemberId] = useState<number | null>(null);
  const [partnerMemberId, setPartnerMemberId] = useState<number | null>(null);

  const createHousehold = trpc.household.create.useMutation();
  const saveRhythm = trpc.onboarding.saveRhythm.useMutation();
  const saveDomain = trpc.onboarding.saveDomainAssignment.useMutation();
  const saveExceptions = trpc.onboarding.saveExceptions.useMutation();

  const isLoading =
    createHousehold.isPending ||
    saveRhythm.isPending ||
    saveDomain.isPending ||
    saveExceptions.isPending;

  const totalSteps = 4;

  async function handleStep1() {
    if (!primaryName.trim() || !partnerName.trim()) {
      toast.error("Please enter both names");
      return;
    }
    try {
      const result = await createHousehold.mutateAsync({ primaryName, partnerName });
      const hToken = result.household.shareToken;
      setToken(hToken);
      setPrimaryMemberId(result.primaryMember.id);
      setPartnerMemberId(result.partnerMember.id);
      setHousehold(result.household as any);
      setMembers([result.primaryMember as any, result.partnerMember as any]);
      persistIdentity(hToken, result.primaryMember.id);
      setStep(2);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create household");
    }
  }

  async function handleStep2() {
    if (!token) return;
    if (rhythmText.trim()) {
      try {
        await saveRhythm.mutateAsync({ token, rawText: rhythmText, primaryName, partnerName });
      } catch {
        // Non-blocking — rhythm is optional
      }
    }
    setStep(3);
  }

  async function handleStep3() {
    if (!token || !primaryMemberId || !partnerMemberId) return;
    try {
      const assignmentList = CATEGORIES.map((c) => ({
        category: c.id,
        assignee: assignments[c.id] as Assignment,
      }));
      await saveDomain.mutateAsync({
        token,
        assignments: assignmentList,
        primaryMemberId,
        partnerMemberId,
      });
      setStep(4);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save assignments");
    }
  }

  async function handleStep4() {
    if (!token || !primaryMemberId || !partnerMemberId) return;
    if (exceptionsText.trim()) {
      try {
        await saveExceptions.mutateAsync({
          token,
          exceptionsText,
          primaryName,
          partnerName,
          primaryMemberId,
          partnerMemberId,
        });
      } catch {
        // Non-blocking
      }
    }
    toast.success("Your household is set up! Welcome to Offload.");
    navigate("/dashboard");
  }

  function setAssignment(categoryId: string, value: Assignment) {
    setAssignments((prev) => ({ ...prev, [categoryId]: value }));
  }

  const assignmentColors: Record<Assignment, string> = {
    primary: "bg-teal-100 text-teal-800 border-teal-200",
    partner: "bg-violet-100 text-violet-800 border-violet-200",
    ask: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const meta = STEP_META[step - 1];

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* ── Decorative background blobs ─────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 55% 45% at 5% 0%, oklch(0.88 0.07 165 / 0.5) 0%, transparent 65%),
            radial-gradient(ellipse 45% 40% at 95% 100%, oklch(0.86 0.08 185 / 0.4) 0%, transparent 60%),
            radial-gradient(ellipse 35% 30% at 80% 15%, oklch(0.90 0.06 155 / 0.3) 0%, transparent 55%)
          `,
        }}
      />
      {/* Subtle dot grid */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(0.30 0.05 185) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/70 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm overflow-hidden">
            <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden>
              <path d="M2 22 Q8 19 16 22 Q24 25 30 22 L30 28 L2 28 Z" fill="white" opacity={0.35} />
              <path d="M7 22 Q10 27 16 28 Q22 27 25 22 Z" fill="white" opacity={0.85} />
              <rect x="8" y="18" width="16" height="5" rx="1.5" fill="white" opacity={0.7} />
              <line x1="16" y1="18" x2="16" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity={0.9} />
              <path d="M16 8 L23 11 L16 14 Z" fill="white" opacity={0.9} />
            </svg>
          </div>
          <span className="font-bold text-foreground text-base tracking-tight">Offload</span>
        </div>
        {/* Progress pills */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i + 1 < step
                  ? "w-5 bg-primary/50"
                  : i + 1 === step
                  ? "w-8 bg-primary"
                  : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">

          {/* Step heading */}
          <div className="text-center space-y-2 mb-7">
            {/* Emoji in a soft circle */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/80 shadow-sm border border-border/60 text-3xl mb-1 backdrop-blur-sm">
              {meta.emoji}
            </div>
            <h1 className="text-2xl font-bold text-foreground">{meta.title}</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {meta.subtitle}
            </p>
          </div>

          {/* ── Step 1: Names ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="card-glass rounded-2xl p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Your name</label>
                  <Input
                    placeholder="e.g. Sarah"
                    value={primaryName}
                    onChange={(e) => setPrimaryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStep1()}
                    className="text-base bg-white/80"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Your partner's name</label>
                  <Input
                    placeholder="e.g. James"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStep1()}
                    className="text-base bg-white/80"
                  />
                </div>
              </div>
              <Button
                className="w-full fab-pill text-primary-foreground border-0"
                size="lg"
                onClick={handleStep1}
                disabled={isLoading || !primaryName.trim() || !partnerName.trim()}
              >
                {isLoading ? "Setting up..." : "Continue"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* ── Step 2: Household Rhythm ──────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="card-glass rounded-2xl p-5">
                <Textarea
                  placeholder={`e.g. ${primaryName || "I"} always do school drop-off. ${partnerName || "Partner"} does pick-up. Julian has Taekwondo on Wednesdays and Saturdays. Juniper has ballet on Saturdays and Sundays.`}
                  value={rhythmText}
                  onChange={(e) => setRhythmText(e.target.value)}
                  className="min-h-[140px] text-base resize-none bg-white/80 border-border/60"
                />
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/40" />
                  Optional — you can skip this and add it later in Settings.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep(1)} className="flex-1 bg-white/70">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button size="lg" onClick={handleStep2} disabled={isLoading} className="flex-1 fab-pill text-primary-foreground border-0">
                  {isLoading ? "Saving..." : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Domain Assignment ─────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex gap-2 text-xs justify-center flex-wrap">
                <span className={`px-2.5 py-1 rounded-full border font-medium ${assignmentColors.primary}`}>
                  {primaryName || "You"}
                </span>
                <span className={`px-2.5 py-1 rounded-full border font-medium ${assignmentColors.partner}`}>
                  {partnerName || "Partner"}
                </span>
                <span className={`px-2.5 py-1 rounded-full border font-medium ${assignmentColors.ask}`}>
                  Ask each time
                </span>
              </div>
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 rounded-xl">
                {CATEGORIES.map((cat) => (
                  <div
                    key={cat.id}
                    className="card-glass rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl">{cat.icon}</span>
                      <span className="text-sm font-medium text-foreground truncate">{cat.label}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {(["primary", "partner", "ask"] as Assignment[]).map((a) => (
                        <button
                          key={a}
                          onClick={() => setAssignment(cat.id, a)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-all font-medium ${
                            assignments[cat.id] === a
                              ? assignmentColors[a]
                              : "bg-white/60 text-muted-foreground border-border/60 hover:border-primary/40"
                          }`}
                        >
                          {a === "primary" ? primaryName || "Me" : a === "partner" ? partnerName || "Partner" : "Ask"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep(2)} className="flex-1 bg-white/70">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button size="lg" onClick={handleStep3} disabled={isLoading} className="flex-1 fab-pill text-primary-foreground border-0">
                  {isLoading ? "Saving..." : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Exceptions ───────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="card-glass rounded-2xl p-5">
                <Textarea
                  placeholder="e.g. James handles insurance for himself and the cats, but I handle mine and the kids'. Dental for the kids is James because they go to his dentist."
                  value={exceptionsText}
                  onChange={(e) => setExceptionsText(e.target.value)}
                  className="min-h-[120px] text-base resize-none bg-white/80 border-border/60"
                />
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/40" />
                  Optional — skip if you want Offload to ask and learn as you go.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep(3)} className="flex-1 bg-white/70">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button size="lg" onClick={handleStep4} disabled={isLoading} className="flex-1 fab-pill text-primary-foreground border-0">
                  {isLoading ? "Finishing up..." : "Let's go! 🌿"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
