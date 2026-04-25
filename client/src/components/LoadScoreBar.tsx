import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Circular ring SVG for avatar decoration */
function AvatarRing({
  pct,
  color,
  size = 48,
}: {
  pct: number;
  color: string;
  size?: number;
}) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0"
      style={{ transform: "rotate(-90deg)" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        className="text-black/5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease-out" }}
      />
    </svg>
  );
}

export default function LoadScoreBar() {
  const { household, token } = useHousehold();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threshold, setThreshold] = useState<number[]>([
    Math.round((household?.imbalanceThreshold ?? 0.6) * 100),
  ]);

  const { data: loadData, refetch } = trpc.load.scores.useQuery(
    { token: token ?? "" },
    { enabled: !!token, refetchInterval: 30000 }
  );

  const updateThreshold = trpc.household.updateThreshold.useMutation({
    onSuccess: () => {
      toast.success("Threshold updated");
      setSettingsOpen(false);
      refetch();
    },
  });

  if (!loadData || !household) return null;

  const { scores, totalScore, imbalanced } = loadData;
  const primary = scores[0];
  const partner = scores[1];

  const primaryPct =
    totalScore > 0 ? Math.round(((primary?.score ?? 0) / totalScore) * 100) : 50;
  const partnerPct = 100 - primaryPct;

  async function saveThreshold() {
    if (!household) return;
    await updateThreshold.mutateAsync({
      token: token ?? "",
      threshold: threshold[0] / 100,
    });
  }

  const primaryColor = imbalanced && primaryPct > partnerPct
    ? "oklch(0.65 0.15 50)"
    : "oklch(0.50 0.13 185)";
  const partnerColor = imbalanced && partnerPct > primaryPct
    ? "oklch(0.65 0.15 50)"
    : "oklch(0.62 0.10 155)";

  return (
    <>
      <div
        className={`rounded-2xl overflow-hidden transition-all ${
          imbalanced
            ? "shadow-[0_0_0_1px_oklch(0.8_0.12_50/0.4),0_4px_16px_oklch(0_0_0/0.07)]"
            : "shadow-[0_0_0_1px_oklch(0.88_0.018_175/0.6),0_4px_16px_oklch(0_0_0/0.06)]"
        }`}
      >
        {/* Gradient header */}
        <div
          className={`px-5 pt-5 pb-4 relative overflow-hidden ${
            imbalanced
              ? "bg-gradient-to-br from-orange-50 via-amber-50/80 to-orange-50/60"
              : "bg-gradient-to-br from-teal-50/80 via-white/70 to-emerald-50/60"
          }`}
        >
          {/* Subtle decorative circle in corner */}
          <div
            aria-hidden
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
            style={{
              background: imbalanced
                ? "radial-gradient(circle, oklch(0.75 0.15 50) 0%, transparent 70%)"
                : "radial-gradient(circle, oklch(0.70 0.12 185) 0%, transparent 70%)",
            }}
          />

          {/* Header row */}
          <div className="flex items-center justify-between mb-4 relative">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Mental Load
              </span>
              {imbalanced && (
                <span className="inline-flex items-center gap-1 text-orange-600 text-xs font-semibold bg-orange-100 px-2.5 py-0.5 rounded-full border border-orange-200/60">
                  <AlertTriangle className="w-3 h-3" />
                  Check in
                </span>
              )}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              title="Adjust threshold"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Avatar + percentage row */}
          <div className="flex items-center gap-4 mb-4 relative">
            {/* Primary person */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative w-12 h-12 shrink-0">
                <AvatarRing pct={primaryPct} color={primaryColor} size={48} />
                <div className="absolute inset-1.5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold overflow-hidden">
                  {(primary?.member as any)?.avatarUrl ? (
                    <img src={(primary?.member as any).avatarUrl} alt={primary?.member.displayName} className="w-full h-full object-cover" />
                  ) : (
                    primary ? initials(primary.member.displayName) : "?"
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {primary?.member.displayName ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {primary?.openCount ?? 0} task{(primary?.openCount ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <span
                className="ml-auto text-2xl font-black tabular-nums leading-none"
                style={{ color: primaryColor }}
              >
                {primaryPct}%
              </span>
            </div>

            {/* Divider */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-px h-6 bg-border/50" />
              <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">vs</span>
              <div className="w-px h-6 bg-border/50" />
            </div>

            {/* Partner */}
            <div className="flex items-center gap-3 flex-1 min-w-0 flex-row-reverse">
              <div className="relative w-12 h-12 shrink-0">
                <AvatarRing pct={partnerPct} color={partnerColor} size={48} />
                <div className="absolute inset-1.5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold overflow-hidden">
                  {(partner?.member as any)?.avatarUrl ? (
                    <img src={(partner?.member as any).avatarUrl} alt={partner?.member.displayName} className="w-full h-full object-cover" />
                  ) : (
                    partner ? initials(partner.member.displayName) : "?"
                  )}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs font-semibold text-foreground truncate">
                  {partner?.member.displayName ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {partner?.openCount ?? 0} task{(partner?.openCount ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <span
                className="mr-auto text-2xl font-black tabular-nums leading-none"
                style={{ color: partnerColor }}
              >
                {partnerPct}%
              </span>
            </div>
          </div>

          {/* Segmented load bar */}
          <div className="h-3 rounded-full bg-black/5 overflow-hidden flex gap-0.5 relative shadow-inner">
            <div
              className="h-full rounded-l-full transition-all duration-700 ease-out load-bar-primary"
              style={{ width: `${primaryPct}%` }}
            />
            <div
              className="h-full rounded-r-full transition-all duration-700 ease-out load-bar-partner"
              style={{ width: `${partnerPct}%` }}
            />
          </div>
        </div>

        {/* Imbalance nudge */}
        {imbalanced && (() => {
          const overloadedName = primaryPct > partnerPct
            ? (primary?.member.displayName ?? "one person")
            : (partner?.member.displayName ?? "one person");
          const sentences = [
            { icon: "🌱", text: `A balanced household makes everyone happier — ${overloadedName} could use a hand right now.` },
            { icon: "💬", text: `Worth a conversation? ${overloadedName} is carrying most of the load at the moment.` },
            { icon: "🤝", text: `Sharing the load evenly is one of the kindest things partners can do for each other.` },
            { icon: "✨", text: `When both people feel seen, the whole household runs better. ${overloadedName} might need some relief.` },
            { icon: "💪", text: `Teamwork makes the dream work — ${overloadedName} has a lot on their plate right now.` },
          ];
          // Pick a stable sentence based on the overloaded person's name (consistent per session)
          const idx = overloadedName.charCodeAt(0) % sentences.length;
          const { icon, text } = sentences[idx];
          return (
            <div className="px-5 py-3 bg-orange-50 border-t border-orange-100/80 flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5">{icon}</span>
              <p className="text-xs text-orange-700 leading-relaxed">{text}</p>
            </div>
          );
        })()}
      </div>

      {/* Threshold settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load imbalance sensitivity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Show the imbalance signal when one person carries more than this share of the total load.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Threshold</span>
                <span className="font-semibold text-foreground">
                  {threshold[0]}% / {100 - threshold[0]}%
                </span>
              </div>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
                min={51}
                max={80}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>More sensitive (51%)</span>
                <span>Less sensitive (80%)</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveThreshold} disabled={updateThreshold.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
