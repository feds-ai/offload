import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import { SlidersHorizontal } from "lucide-react";
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

// ─── Plant SVG ────────────────────────────────────────────────────────────────
// "load" is 0–1 where 0 = no tasks (perky) and 1 = heavy load (wilting)
function PlantSVG({ load, color }: { load: number; color: string }) {
  // Stem leans right when wilting (positive angle = right lean)
  const wilt = load; // 0 = upright, 1 = fully wilted
  const stemAngle = wilt * 28; // degrees of lean
  const leafDroop = wilt * 18; // leaf angle droop
  const opacity = 0.55 + (1 - wilt) * 0.45; // brighter when perky
  const stemH = 20 - wilt * 5; // shorter stem when wilted

  // Stem path: starts at bottom-center, curves to top with lean
  const cx = 24;
  const stemBottom = 44;
  const stemTop = stemBottom - stemH;
  const tipX = cx + Math.sin((stemAngle * Math.PI) / 180) * stemH;
  const tipY = stemTop;

  // Control point for gentle curve
  const cpX = cx + Math.sin((stemAngle * Math.PI) / 180) * (stemH * 0.5);
  const cpY = stemBottom - stemH * 0.6;

  // Leaf positions — two leaves branching off the stem
  const leftLeafAngle = -40 - leafDroop;
  const rightLeafAngle = 40 + leafDroop;

  return (
    <svg
      viewBox="0 0 48 48"
      width="40"
      height="40"
      style={{ opacity, transition: "all 0.8s ease-out" }}
      aria-hidden
    >
      {/* Pot */}
      <path
        d="M18 44 h12 l-1.5 4 h-9 z"
        fill={color}
        opacity={0.25}
      />
      <rect x="16" y="42" width="16" height="3" rx="1.5" fill={color} opacity={0.35} />

      {/* Stem */}
      <path
        d={`M ${cx} ${stemBottom} Q ${cpX} ${cpY} ${tipX} ${tipY}`}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        style={{ transition: "all 0.8s ease-out" }}
      />

      {/* Left leaf */}
      <g
        transform={`translate(${cpX - 1} ${cpY + 4}) rotate(${leftLeafAngle})`}
        style={{ transition: "all 0.8s ease-out" }}
      >
        <ellipse cx="0" cy="-7" rx="5" ry="8" fill={color} opacity={0.85} />
        <line x1="0" y1="0" x2="0" y2="-13" stroke={color} strokeWidth="1" opacity={0.5} />
      </g>

      {/* Right leaf */}
      <g
        transform={`translate(${cpX + 1} ${cpY + 4}) rotate(${rightLeafAngle})`}
        style={{ transition: "all 0.8s ease-out" }}
      >
        <ellipse cx="0" cy="-7" rx="5" ry="8" fill={color} opacity={0.85} />
        <line x1="0" y1="0" x2="0" y2="-13" stroke={color} strokeWidth="1" opacity={0.5} />
      </g>

      {/* Top bud / flower when perky */}
      {wilt < 0.4 && (
        <circle
          cx={tipX}
          cy={tipY - 3}
          r={3.5}
          fill={color}
          opacity={0.9 - wilt}
          style={{ transition: "all 0.8s ease-out" }}
        />
      )}
    </svg>
  );
}

// ─── Growth Ring SVG ──────────────────────────────────────────────────────────
// fill is 0–1 representing how full the ring is
function GrowthRing({
  fill,
  color,
  size = 80,
  children,
}: {
  fill: number;
  color: string;
  size?: number;
  children?: React.ReactNode;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0.04, fill) * circ; // always show at least a tiny arc

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          className="text-black/6"
        />
        {/* Fill arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s ease-out, stroke 0.6s ease-out" }}
        />
      </svg>
      {/* Inner content */}
      <div className="relative flex items-center justify-center w-full h-full">
        {children}
      </div>
    </div>
  );
}

// ─── Warm sentences ───────────────────────────────────────────────────────────
function getBalanceSentence(
  imbalanced: boolean,
  primaryName: string,
  partnerName: string,
  primaryIsHeavier: boolean
): { icon: string; text: string } {
  const heavierName = primaryIsHeavier ? primaryName : partnerName;
  const lighterName = primaryIsHeavier ? partnerName : primaryName;

  if (!imbalanced) {
    const balanced = [
      { icon: "🌿", text: `${primaryName} and ${partnerName} are sharing the load well right now.` },
      { icon: "💚", text: `Things feel balanced between ${primaryName} and ${partnerName} — lovely.` },
      { icon: "🤝", text: `${primaryName} and ${partnerName} are in a good rhythm together.` },
      { icon: "✨", text: `Equal footing — ${primaryName} and ${partnerName} are doing great.` },
    ];
    const idx = (primaryName.charCodeAt(0) + partnerName.charCodeAt(0)) % balanced.length;
    return balanced[idx];
  }

  const unbalanced = [
    { icon: "💬", text: `${heavierName} is carrying a lot right now — worth a chat with ${lighterName}?` },
    { icon: "🌱", text: `${heavierName} could use some relief. A good moment to redistribute a few things.` },
    { icon: "🤲", text: `${lighterName}, ${heavierName} has a heavier plate at the moment — could you take something on?` },
    { icon: "💛", text: `Noticing ${heavierName} has more on right now. Small shifts make a big difference.` },
  ];
  const idx = heavierName.charCodeAt(0) % unbalanced.length;
  return unbalanced[idx];
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  const primaryCount = primary?.openCount ?? 0;
  const partnerCount = partner?.openCount ?? 0;
  const maxCount = Math.max(primaryCount, partnerCount, 1);

  // Ring fill: proportional to task count vs the heavier person (0–1)
  const primaryFill = primaryCount / maxCount;
  const partnerFill = partnerCount / maxCount;

  // Plant load: 0 = no tasks (perky), 1 = max tasks (wilting)
  const primaryLoad = primaryFill;
  const partnerLoad = partnerFill;

  const primaryIsHeavier = primaryCount >= partnerCount;

  // Colours: teal when balanced/lighter, warm amber when heavier + imbalanced
  const primaryColor =
    imbalanced && primaryIsHeavier ? "oklch(0.62 0.14 50)" : "oklch(0.48 0.12 185)";
  const partnerColor =
    imbalanced && !primaryIsHeavier ? "oklch(0.62 0.14 50)" : "oklch(0.55 0.11 155)";

  const sentence = getBalanceSentence(
    imbalanced,
    primary?.member.displayName ?? "Person 1",
    partner?.member.displayName ?? "Person 2",
    primaryIsHeavier
  );

  async function saveThreshold() {
    if (!household) return;
    await updateThreshold.mutateAsync({
      token: token ?? "",
      threshold: threshold[0] / 100,
    });
  }

  return (
    <>
      <div
        className={`rounded-2xl overflow-hidden transition-all ${
          imbalanced
            ? "shadow-[0_0_0_1px_oklch(0.8_0.12_50/0.4),0_4px_16px_oklch(0_0_0/0.07)]"
            : "shadow-[0_0_0_1px_oklch(0.88_0.018_175/0.6),0_4px_16px_oklch(0_0_0/0.06)]"
        }`}
      >
        <div
          className={`px-5 pt-5 pb-5 relative overflow-hidden ${
            imbalanced
              ? "bg-gradient-to-br from-orange-50 via-amber-50/80 to-orange-50/60"
              : "bg-gradient-to-br from-teal-50/80 via-white/70 to-emerald-50/60"
          }`}
        >
          {/* Decorative blob */}
          <div
            aria-hidden
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 pointer-events-none"
            style={{
              background: imbalanced
                ? "radial-gradient(circle, oklch(0.75 0.15 50) 0%, transparent 70%)"
                : "radial-gradient(circle, oklch(0.70 0.12 185) 0%, transparent 70%)",
            }}
          />

          {/* Header row */}
          <div className="flex items-center justify-between mb-5 relative">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Mental Load
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              title="Adjust sensitivity"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Botanical rings row */}
          <div className="flex items-end justify-around gap-4 mb-5 relative">
            {/* Primary */}
            <div className="flex flex-col items-center gap-2">
              <GrowthRing fill={primaryFill} color={primaryColor} size={84}>
                {/* Avatar or plant */}
                <div className="flex flex-col items-center justify-center">
                  {(primary?.member as any)?.avatarUrl ? (
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/60 shadow-sm">
                      <img
                        src={(primary?.member as any).avatarUrl}
                        alt={primary?.member.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <PlantSVG load={primaryLoad} color={primaryColor} />
                  )}
                </div>
              </GrowthRing>
              <div className="text-center">
                <p className="text-xs font-semibold text-foreground leading-tight">
                  {primary?.member.displayName ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {primaryCount} {primaryCount === 1 ? "task" : "tasks"}
                </p>
              </div>
            </div>

            {/* Centre divider with leaf motif */}
            <div className="flex flex-col items-center gap-1 pb-7 shrink-0 opacity-30">
              <div className="w-px h-5 bg-border" />
              <span className="text-base">🌿</span>
              <div className="w-px h-5 bg-border" />
            </div>

            {/* Partner */}
            <div className="flex flex-col items-center gap-2">
              <GrowthRing fill={partnerFill} color={partnerColor} size={84}>
                <div className="flex flex-col items-center justify-center">
                  {(partner?.member as any)?.avatarUrl ? (
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/60 shadow-sm">
                      <img
                        src={(partner?.member as any).avatarUrl}
                        alt={partner?.member.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <PlantSVG load={partnerLoad} color={partnerColor} />
                  )}
                </div>
              </GrowthRing>
              <div className="text-center">
                <p className="text-xs font-semibold text-foreground leading-tight">
                  {partner?.member.displayName ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {partnerCount} {partnerCount === 1 ? "task" : "tasks"}
                </p>
              </div>
            </div>
          </div>

          {/* Always-visible warm sentence */}
          <div
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl ${
              imbalanced
                ? "bg-orange-100/60 border border-orange-200/50"
                : "bg-white/50 border border-teal-100/60"
            }`}
          >
            <span className="text-sm leading-none mt-0.5 shrink-0">{sentence.icon}</span>
            <p
              className={`text-xs leading-relaxed ${
                imbalanced ? "text-orange-700" : "text-teal-700"
              }`}
            >
              {sentence.text}
            </p>
          </div>
        </div>
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
