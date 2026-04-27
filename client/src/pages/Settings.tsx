import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash2,
  RotateCcw,
  Calendar,
  Scale,
  Route,
  RefreshCw,
  Leaf,
  Camera,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CATEGORY_LABELS: Record<string, string> = {
  school: "School",
  medical: "Medical",
  social: "Social / Parties",
  insurance: "Insurance",
  admin: "Admin",
  household: "Household",
  cars: "Cars",
  pets: "Pets",
  finances: "Finances",
  general: "General",
};

export default function Settings() {
  const [, navigate] = useLocation();
  const { token, household, members, myMemberId, persistIdentity } = useHousehold();
  const [thresholdValue, setThresholdValue] = useState<number | null>(null);
  const [rhythmText, setRhythmText] = useState("");
  const [rhythmEditing, setRhythmEditing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState<number | null>(null);

  const uploadAvatar = trpc.household.uploadAvatar.useMutation({
    onSuccess: () => {
      utils.household.getByToken.invalidate();
      toast.success("Profile picture updated!");
    },
    onError: () => toast.error("Failed to upload picture."),
  });

  const utils = trpc.useUtils();
  const primaryMember = members.find((m) => m.role === "primary");
  const partnerMember = members.find((m) => m.role === "partner");
  const myMember = members.find((m) => m.id === myMemberId);

  async function handleAvatarChange(memberId: number, file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image must be under 4 MB.");
      return;
    }
    setAvatarUploading(memberId);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await uploadAvatar.mutateAsync({
        token: token ?? "",
        memberId,
        imageBase64: base64,
        mimeType: file.type,
      });
    } finally {
      setAvatarUploading(null);
    }
  }

  // ─── Routing rules ──────────────────────────────────────────────────────────
  const { data: rules, refetch: refetchRules } = trpc.routing.getRules.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const deleteRuleMutation = trpc.routing.deleteRule.useMutation({
    onSuccess: () => {
      refetchRules();
      toast.success("Routing rule removed.");
    },
    onError: () => toast.error("Failed to remove rule."),
  });

  // ─── Dismissed inference types ──────────────────────────────────────────────
  const { data: dismissed, refetch: refetchDismissed } = trpc.routing.getDismissed.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const restoreMutation = trpc.routing.restore.useMutation({
    onSuccess: () => {
      refetchDismissed();
      toast.success("Suggestion type re-enabled.");
    },
    onError: () => toast.error("Failed to restore suggestion type."),
  });

  // ─── Imbalance threshold ────────────────────────────────────────────────────
  const updateThresholdMutation = trpc.household.updateThreshold.useMutation({
    onSuccess: () => {
      utils.load.scores.invalidate();
      toast.success("Imbalance threshold updated.");
    },
    onError: () => toast.error("Failed to update threshold."),
  });

  const currentThreshold = thresholdValue ?? (household?.imbalanceThreshold ?? 0.6);

  function handleThresholdSave() {
    if (!token) return;
    updateThresholdMutation.mutate({ token, threshold: currentThreshold });
  }

  // ─── Household rhythm ───────────────────────────────────────────────────────
  const { data: rhythmData } = trpc.settings.getRhythm.useQuery(
    { token: token ?? "" },
    {
      enabled: !!token,
      onSuccess: (data: any) => {
        if (data?.rawText && !rhythmEditing) setRhythmText(data.rawText);
      },
    } as any
  );

  const updateRhythmMutation = trpc.settings.updateRhythm.useMutation({
    onSuccess: () => {
      setRhythmEditing(false);
      toast.success("Household rhythm updated. New routing rules applied.");
    },
    onError: () => toast.error("Failed to update rhythm."),
  });

  function handleRhythmSave() {
    if (!token || !rhythmText.trim()) return;
    updateRhythmMutation.mutate({
      token,
      rawText: rhythmText,
      primaryName: primaryMember?.displayName ?? "Primary",
      partnerName: partnerMember?.displayName ?? "Partner",
    });
  }

  // ─── Google Calendar OAuth redirect handling ────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendarConnected") === "true") {
      toast.success("Google Calendar connected!", {
        description: "Events and task reminders will now be added to your calendar automatically.",
      });
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("calendarError")) {
      toast.error("Google Calendar connection failed", {
        description: "Please try again. If the problem persists, check your credentials in Settings → Secrets.",
      });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  // ─── Google Calendar ────────────────────────────────────────────────────────
  const { data: calendarAuthData } = trpc.calendar.getAuthUrl.useQuery(
    { token: token ?? "", redirectUri: `${window.location.origin}/api/calendar/callback` },
    { enabled: !!token }
  );

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">No household found. Please complete onboarding first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 50% 35% at 0% 0%, oklch(0.88 0.07 165 / 0.35) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 100% 100%, oklch(0.86 0.08 185 / 0.25) 0%, transparent 55%)
          `,
        }}
      />
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="hover:bg-primary/8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <Leaf className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground tracking-tight">Settings</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* ─── Identity ─────────────────────────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">Household Members</div>
          <div className="card-glass rounded-2xl p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              You are currently identified as{" "}
              <span className="font-semibold text-foreground">
                {myMember?.displayName ?? "Unknown"}
              </span>{" "}
              on this device.
            </p>
            {/* Member avatars */}
            <div className="flex gap-4">
              {members.map((m) => {
                const isUploading = avatarUploading === m.id;
                const initials = m.displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <div key={m.id} className="flex flex-col items-center gap-2">
                    <label className="relative cursor-pointer group" title="Change profile picture">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                        {(m as any).avatarUrl ? (
                          <img src={(m as any).avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg font-semibold text-primary">{initials}</span>
                        )}
                        {isUploading && (
                          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                            <RefreshCw className="h-5 w-5 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <Camera className="h-3 w-3 text-white" />
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAvatarChange(m.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <span className="text-xs font-medium text-foreground">{m.displayName}</span>
                    <Button
                      variant={m.id === myMemberId ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7 px-3"
                      onClick={() => {
                        if (token) persistIdentity(token, m.id);
                        toast.success(`Switched to ${m.displayName}`);
                      }}
                    >
                      {m.id === myMemberId ? "Active" : "Switch"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <Separator />

        {/* ─── Imbalance Threshold ──────────────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">
            <Scale className="h-3.5 w-3.5 text-primary" />
            Imbalance Signal Threshold
          </div>
          <div className="card-glass rounded-2xl p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Show the imbalance signal when one person carries more than{" "}
              <span className="font-semibold text-foreground">
                {Math.round(currentThreshold * 100)}%
              </span>{" "}
              of the load. Default is 60%.
            </p>
            <Slider
              min={50}
              max={90}
              step={5}
              value={[Math.round(currentThreshold * 100)]}
              onValueChange={([v]) => setThresholdValue(v / 100)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50% (sensitive)</span>
              <span>90% (lenient)</span>
            </div>
            <Button
              size="sm"
              onClick={handleThresholdSave}
              disabled={updateThresholdMutation.isPending}
            >
              Save threshold
            </Button>
          </div>
        </section>

        <Separator />

        {/* ─── Routing Rules ────────────────────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">
            <Route className="h-3.5 w-3.5 text-primary" />
            Routing Rules
          </div>
          <div className="card-glass rounded-2xl divide-y divide-border/40">
            {!rules || rules.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No routing rules yet. They'll be learned as you use Offload.
              </div>
            ) : (
              rules.map((rule: any) => {
                const assignee =
                  rule.assigneeMemberId === primaryMember?.id
                    ? primaryMember?.displayName
                    : partnerMember?.displayName;
                return (
                  <div key={rule.id} className="flex items-center justify-between p-3 gap-3">
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORY_LABELS[rule.category] ?? rule.category}
                      </Badge>
                      {rule.subject && (
                        <Badge variant="outline" className="text-xs">
                          {rule.subject}
                        </Badge>
                      )}
                      {rule.qualifier && (
                        <Badge variant="outline" className="text-xs">
                          {rule.qualifier}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground self-center">→</span>
                      <span className="text-xs font-medium text-foreground self-center">
                        {assignee ?? "Unknown"}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs capitalize text-muted-foreground"
                      >
                        {rule.source}
                      </Badge>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove routing rule?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This rule will no longer be used for automatic task routing. You can always re-add it by answering the routing prompt again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteRuleMutation.mutate({ token: token!, ruleId: rule.id })}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <Separator />

        {/* ─── Dismissed Suggestion Types ───────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
            Dismissed Suggestions
          </div>
          <div className="card-glass rounded-2xl divide-y divide-border/40">
            {!dismissed || dismissed.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No dismissed suggestion types. When you dismiss a suggestion three times, it'll appear here so you can re-enable it.
              </div>
            ) : (
              dismissed.map((d: any) => (
                <div key={d.inferenceType} className="flex items-center justify-between p-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{d.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Dismissed {d.dismissCount} time{d.dismissCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() =>
                      restoreMutation.mutate({ token: token!, inferenceType: d.inferenceType })
                    }
                    disabled={restoreMutation.isPending}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Re-enable
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <Separator />

        {/* ─── Household Rhythm ─────────────────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
            Household Rhythm
          </div>
          <div className="card-glass rounded-2xl p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Describe your weekly schedule in plain language. Offload uses this to infer preparation reminders automatically.
            </p>
            {!rhythmEditing && rhythmData?.rawText ? (
              <div className="space-y-2">
                <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">
                  {rhythmData.rawText}
                </p>
                <Button variant="outline" size="sm" onClick={() => { setRhythmText(rhythmData.rawText); setRhythmEditing(true); }}>
                  Edit rhythm
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={rhythmText}
                  onChange={(e) => setRhythmText(e.target.value)}
                  placeholder="e.g. Julian has Taekwondo on Wednesdays and Saturdays. Juniper has ballet on Saturdays and Sundays, and water play on Wednesdays. I always do school drop-off, my husband always does pick-up."
                  className="min-h-[120px] text-sm resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleRhythmSave}
                    disabled={updateRhythmMutation.isPending || !rhythmText.trim()}
                  >
                    {updateRhythmMutation.isPending ? "Saving…" : "Save rhythm"}
                  </Button>
                  {rhythmEditing && (
                    <Button variant="ghost" size="sm" onClick={() => setRhythmEditing(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* ─── Google Calendar ──────────────────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            Google Calendar
          </div>
          <div className="card-glass rounded-2xl p-4 space-y-3">
            {calendarAuthData?.configured ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your Google Calendar so events and task reminders are added automatically.
                </p>
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.googleCalendarToken ? "Connected" : "Not connected"}
                        </p>
                      </div>
                      {!m.googleCalendarToken && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (calendarAuthData?.url) {
                              localStorage.setItem("offload_calendar_member_id", String(m.id));
                              window.location.href = calendarAuthData.url;
                            }
                          }}
                        >
                          Connect
                        </Button>
                      )}
                      {m.googleCalendarToken && (
                        <Badge variant="secondary" className="text-xs text-emerald-700 bg-emerald-50">
                          ✓ Connected
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Google Calendar integration is not yet configured. To enable it, add your{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">GOOGLE_CLIENT_SECRET</code> in Settings → Secrets.
                </p>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">
                  Coming soon — add credentials to enable
                </Badge>
              </div>
            )}
          </div>
        </section>

        {/* ─── Household info ───────────────────────────────────────────────── */}
        <section>
          <div className="section-label mb-3">Household</div>
          <div className="card-glass rounded-2xl p-4 space-y-2">
            <p className="text-sm text-foreground font-medium">{household?.name}</p>
            <p className="text-xs text-muted-foreground font-mono break-all">
              Share token: {household?.shareToken}
            </p>
            <p className="text-xs text-muted-foreground">
              Share link:{" "}
              <span className="font-mono">
                {window.location.origin}/shared/{household?.shareToken}
              </span>
            </p>
          </div>
        </section>

        <div className="h-8" />
      </main>
    </div>
  );
}
