import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Home, Leaf } from "lucide-react";
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

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { setHousehold, setMembers, setMyMemberId } = useHousehold();

  const [step, setStep] = useState(1);
  const [primaryName, setPrimaryName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [rhythmText, setRhythmText] = useState("");
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.id, "ask"]))
  );
  const [exceptionsText, setExceptionsText] = useState("");
  const [householdId, setHouseholdId] = useState<number | null>(null);
  const [primaryMemberId, setPrimaryMemberId] = useState<number | null>(null);
  const [partnerMemberId, setPartnerMemberId] = useState<number | null>(null);

  const createHousehold = trpc.household.create.useMutation();
  const saveRhythm = trpc.onboarding.saveRhythm.useMutation();
  const saveDomain = trpc.onboarding.saveDomainAssignment.useMutation();
  const saveExceptions = trpc.onboarding.saveExceptions.useMutation();
  const getMine = trpc.household.getMine.useQuery(undefined, { enabled: false });

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
      setHouseholdId(result.household.id);
      setPrimaryMemberId(result.primaryMember.id);
      setHousehold(result.household as any);
      setMyMemberId(result.primaryMember.id);
      setStep(2);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create household");
    }
  }

  async function handleStep2() {
    if (!householdId) return;
    if (rhythmText.trim()) {
      try {
        await saveRhythm.mutateAsync({
          householdId,
          rawText: rhythmText,
          primaryName,
          partnerName,
        });
      } catch {
        // Non-blocking — rhythm is optional
      }
    }
    setStep(3);
  }

  async function handleStep3() {
    if (!householdId || !primaryMemberId) return;
    // We need partner member ID — use a placeholder for now (partner hasn't joined yet)
    // Save assignments with primary member only; partner rules will be learned
    try {
      const assignmentList = CATEGORIES.map((c) => ({
        category: c.id,
        assignee: assignments[c.id] as Assignment,
      }));
      await saveDomain.mutateAsync({
        householdId,
        assignments: assignmentList,
        primaryMemberId,
        partnerMemberId: primaryMemberId, // partner hasn't joined yet — will be updated
      });
      setStep(4);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save assignments");
    }
  }

  async function handleStep4() {
    if (!householdId || !primaryMemberId) return;
    if (exceptionsText.trim()) {
      try {
        await saveExceptions.mutateAsync({
          householdId,
          exceptionsText,
          primaryName,
          partnerName,
          primaryMemberId,
          partnerMemberId: primaryMemberId,
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground text-lg">Offload</span>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i + 1 <= step ? "w-8 bg-primary" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Step 1: Names */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-4xl mb-3">👋</div>
                <h1 className="text-2xl font-semibold text-foreground">Welcome to Offload</h1>
                <p className="text-muted-foreground">
                  Let's set up your household. Who are the two main carers?
                </p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Your name</label>
                    <Input
                      placeholder="e.g. Sarah"
                      value={primaryName}
                      onChange={(e) => setPrimaryName(e.target.value)}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Your partner's name</label>
                    <Input
                      placeholder="e.g. James"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      className="text-base"
                    />
                  </div>
                </CardContent>
              </Card>
              <Button
                className="w-full"
                size="lg"
                onClick={handleStep1}
                disabled={isLoading || !primaryName.trim() || !partnerName.trim()}
              >
                {isLoading ? "Setting up..." : "Continue"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 2: Household Rhythm */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-4xl mb-3">🗓️</div>
                <h1 className="text-2xl font-semibold text-foreground">Your weekly rhythm</h1>
                <p className="text-muted-foreground">
                  Describe your regular weekly schedule in plain language. Offload will use this to
                  infer prep reminders automatically.
                </p>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Textarea
                    placeholder={`e.g. ${primaryName || "I"} always do school drop-off. ${partnerName || "Partner"} does pick-up. Julian has Taekwondo on Wednesdays and Saturdays. Juniper has ballet on Saturdays and Sundays. Julian has water play on Mondays, Juniper on Wednesdays.`}
                    value={rhythmText}
                    onChange={(e) => setRhythmText(e.target.value)}
                    className="min-h-[140px] text-base resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Optional — you can skip this and add it later in Settings.
                  </p>
                </CardContent>
              </Card>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button size="lg" onClick={handleStep2} disabled={isLoading} className="flex-1">
                  {isLoading ? "Saving..." : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Domain Assignment */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-4xl mb-3">⚖️</div>
                <h1 className="text-2xl font-semibold text-foreground">Who handles what?</h1>
                <p className="text-muted-foreground">
                  Set default ownership for each area. You can always override individual tasks.
                </p>
              </div>
              <div className="flex gap-2 text-xs justify-center">
                <span className={`px-2 py-1 rounded border ${assignmentColors.primary}`}>
                  {primaryName || "You"}
                </span>
                <span className={`px-2 py-1 rounded border ${assignmentColors.partner}`}>
                  {partnerName || "Partner"}
                </span>
                <span className={`px-2 py-1 rounded border ${assignmentColors.ask}`}>Ask each time</span>
              </div>
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {CATEGORIES.map((cat) => (
                  <Card key={cat.id} className="shadow-none border-border">
                    <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{cat.icon}</span>
                        <span className="text-sm font-medium text-foreground truncate">{cat.label}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {(["primary", "partner", "ask"] as Assignment[]).map((a) => (
                          <button
                            key={a}
                            onClick={() => setAssignment(cat.id, a)}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                              assignments[cat.id] === a
                                ? assignmentColors[a] + " shadow-sm"
                                : "bg-transparent text-muted-foreground border-transparent hover:border-border"
                            }`}
                          >
                            {a === "primary"
                              ? primaryName || "Me"
                              : a === "partner"
                              ? partnerName || "Partner"
                              : "Ask"}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep(2)} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button size="lg" onClick={handleStep3} disabled={isLoading} className="flex-1">
                  {isLoading ? "Saving..." : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Exceptions */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-4xl mb-3">✏️</div>
                <h1 className="text-2xl font-semibold text-foreground">Any exceptions?</h1>
                <p className="text-muted-foreground">
                  Describe any nuances the defaults don't capture. Offload will learn from these.
                </p>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Textarea
                    placeholder={`e.g. ${partnerName || "Partner"} handles car insurance and pet insurance. ${primaryName || "I"} handle my own and the kids' medical, except dental which is with ${partnerName || "Partner"}'s dentist.`}
                    value={exceptionsText}
                    onChange={(e) => setExceptionsText(e.target.value)}
                    className="min-h-[140px] text-base resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Optional — Offload will ask when it's unsure and learn over time.
                  </p>
                </CardContent>
              </Card>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep(3)} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button size="lg" onClick={handleStep4} disabled={isLoading} className="flex-1">
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
