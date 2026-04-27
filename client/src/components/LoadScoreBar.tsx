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

// ─── Cargo Crate SVG ──────────────────────────────────────────────────────────
// crateCount is 1–4 representing how many crates are stacked
function CrateSVG({ crateCount, color }: { crateCount: number; color: string }) {
  const count = Math.max(1, Math.min(4, crateCount));
  const crateH = 10;
  const crateW = 18;
  const cx = 24;
  const baseY = 44;
  const opacity = 0.45 + (count / 4) * 0.5;

  return (
    <svg
      viewBox="0 0 48 48"
      width="38"
      height="38"
      style={{ opacity, transition: "all 0.7s ease-out" }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, idx) => {
        const y = baseY - idx * (crateH + 1);
        const x = cx - crateW / 2;
        return (
          <g key={idx} style={{ transition: "all 0.7s ease-out" }}>
            {/* Crate body */}
            <rect
              x={x}
              y={y - crateH}
              width={crateW}
              height={crateH}
              rx="2"
              fill={color}
              opacity={0.75 - idx * 0.05}
            />
            {/* Crate slat lines */}
            <line
              x1={cx}
              y1={y - crateH}
              x2={cx}
              y2={y}
              stroke="white"
              strokeWidth="1"
              opacity={0.4}
            />
            <line
              x1={x}
              y1={y - crateH / 2}
              x2={x + crateW}
              y2={y - crateH / 2}
              stroke="white"
              strokeWidth="0.8"
              opacity={0.3}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Tilting Boat SVG ─────────────────────────────────────────────────────────
// tilt: -1 = tilts left (primary heavier), +1 = tilts right (partner heavier), 0 = level
// imbalanced: whether to show choppy water
function BoatSVG({ tilt, imbalanced }: { tilt: number; imbalanced: boolean }) {
  // tilt is -1 to +1; convert to degrees (max ±18 deg)
  const angleDeg = tilt * 18;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Water wave animation class
  const waterColor = imbalanced ? "oklch(0.55 0.12 210)" : "oklch(0.62 0.10 195)";
  const waterOpacity = imbalanced ? 0.55 : 0.35;

  return (
    <svg
      viewBox="0 0 160 110"
      width="160"
      height="110"
      aria-hidden
      style={{ overflow: "visible" }}
    >
      {/* Water surface */}
      {imbalanced ? (
        // Choppy water — multiple small waves
        <>
          <path
            d="M0 78 Q13 71 27 78 Q40 85 53 78 Q67 71 80 78 Q93 85 107 78 Q120 71 133 78 Q147 85 160 78 L160 110 L0 110 Z"
            fill={waterColor}
            opacity={waterOpacity}
          />
          <path
            d="M0 84 Q20 77 40 84 Q60 91 80 84 Q100 77 120 84 Q140 91 160 84 L160 110 L0 110 Z"
            fill={waterColor}
            opacity={waterOpacity * 0.6}
          />
        </>
      ) : (
        // Calm water — gentle single wave
        <>
          <path
            d="M0 80 Q40 73 80 80 Q120 87 160 80 L160 110 L0 110 Z"
            fill={waterColor}
            opacity={waterOpacity}
          />
          <path
            d="M0 87 Q40 83 80 87 Q120 91 160 87 L160 110 L0 110 Z"
            fill={waterColor}
            opacity={waterOpacity * 0.5}
          />
        </>
      )}

      {/* Boat group — rotates around the waterline centre */}
      <g
        transform={`translate(80, 78) rotate(${angleDeg}) translate(-80, -78)`}
        style={{ transition: "transform 1s ease-out" }}
      >
        {/* Hull */}
        <path
          d="M44 78 Q50 92 80 95 Q110 92 116 78 Z"
          fill="oklch(0.55 0.09 40)"
          opacity={0.9}
        />
        {/* Hull highlight */}
        <path
          d="M50 78 Q56 88 80 91 Q104 88 110 78 Z"
          fill="white"
          opacity={0.15}
        />
        {/* Deck */}
        <rect x="46" y="69" width="68" height="10" rx="3" fill="oklch(0.65 0.09 45)" opacity={0.95} />
        {/* Cabin */}
        <rect x="60" y="55" width="40" height="15" rx="4" fill="white" opacity={0.85} />
        {/* Cabin window */}
        <rect x="66" y="59" width="10" height="7" rx="2" fill="oklch(0.62 0.10 195)" opacity={0.6} />
        <rect x="80" y="59" width="10" height="7" rx="2" fill="oklch(0.62 0.10 195)" opacity={0.6} />
        {/* Mast */}
        <line x1="80" y1="55" x2="80" y2="24" stroke="oklch(0.45 0.07 40)" strokeWidth="2.5" strokeLinecap="round" />
        {/* Flag / bunting */}
        <path
          d="M80 24 L100 31 L80 38 Z"
          fill="oklch(0.55 0.14 20)"
          opacity={0.85}
        />
        {/* Cargo crates on deck (more when imbalanced) */}
        {imbalanced && (
          <>
            <rect x="48" y="60" width="11" height="10" rx="1.5" fill="oklch(0.55 0.09 40)" opacity={0.6} />
            <rect x="101" y="60" width="11" height="10" rx="1.5" fill="oklch(0.55 0.09 40)" opacity={0.6} />
          </>
        )}
      </g>
    </svg>
  );
}

// ─── Growth Ring SVG ──────────────────────────────────────────────────────────
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
  const dash = Math.max(0.04, fill) * circ;

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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={4} className="text-black/6" />
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
      <div className="relative flex items-center justify-center w-full h-full">
        {children}
      </div>
    </div>
  );
}

// ─── Boat-themed status sentences ─────────────────────────────────────────────
function getBalanceSentence(
  imbalanced: boolean,
  primaryName: string,
  partnerName: string,
  primaryIsHeavier: boolean,
  primaryCount: number,
  partnerCount: number
): { icon: string; text: string } {
  const heavierName = primaryIsHeavier ? primaryName : partnerName;
  const lighterName = primaryIsHeavier ? partnerName : primaryName;
  const total = primaryCount + partnerCount;
  const diff = Math.abs(primaryCount - partnerCount);

  if (total === 0) {
    return { icon: "⛵", text: `Smooth sailing — ${primaryName} and ${partnerName} are all clear.` };
  }

  if (!imbalanced) {
    const balanced = [
      { icon: "⛵", text: `Smooth sailing. ${primaryName} and ${partnerName} are doing great.` },
      { icon: "🌊", text: `${primaryName} and ${partnerName} are keeping the boat level — nice work.` },
      { icon: "⚓", text: `Steady as she goes. ${primaryName} and ${partnerName} are in good shape.` },
      { icon: "🧭", text: `${primaryName} and ${partnerName} are navigating this together beautifully.` },
    ];
    const idx = (primaryName.charCodeAt(0) + partnerName.charCodeAt(0)) % balanced.length;
    return balanced[idx];
  }

  // Imbalanced — check severity
  if (diff >= 5) {
    return { icon: "🚨", text: `Risk of capsizing — time to rebalance. ${lighterName}, could you take something on?` };
  }

  return { icon: "⛵", text: `The boat's leaning a little. Could ${lighterName} take something on from ${heavierName}?` };
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

  const { scores, imbalanced } = loadData;
  const primary = scores[0];
  const partner = scores[1];

  const primaryCount = primary?.openCount ?? 0;
  const partnerCount = partner?.openCount ?? 0;
  const maxCount = Math.max(primaryCount, partnerCount, 1);

  // Ring fill: proportional to task count vs the heavier person (0–1)
  const primaryFill = primaryCount / maxCount;
  const partnerFill = partnerCount / maxCount;

  // Crate count: 1–4 based on task count
  const primaryCrates = Math.min(4, Math.max(1, Math.ceil(primaryCount / 2)));
  const partnerCrates = Math.min(4, Math.max(1, Math.ceil(partnerCount / 2)));

  const primaryIsHeavier = primaryCount >= partnerCount;

  // Boat tilt: negative = tilt left (primary heavier), positive = tilt right (partner heavier)
  const tiltMagnitude = maxCount > 0 ? Math.abs(primaryCount - partnerCount) / maxCount : 0;
  const boatTilt = imbalanced ? (primaryIsHeavier ? -tiltMagnitude : tiltMagnitude) : 0;

  // Colours: teal when balanced/lighter, warm amber when heavier + imbalanced
  const primaryColor =
    imbalanced && primaryIsHeavier ? "oklch(0.62 0.14 50)" : "oklch(0.48 0.12 185)";
  const partnerColor =
    imbalanced && !primaryIsHeavier ? "oklch(0.62 0.14 50)" : "oklch(0.55 0.11 155)";

  const sentence = getBalanceSentence(
    imbalanced,
    primary?.member.displayName ?? "Person 1",
    partner?.member.displayName ?? "Person 2",
    primaryIsHeavier,
    primaryCount,
    partnerCount
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
              : "bg-gradient-to-br from-sky-50/80 via-white/70 to-teal-50/60"
          }`}
        >
          {/* Decorative water shimmer blob */}
          <div
            aria-hidden
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 pointer-events-none"
            style={{
              background: imbalanced
                ? "radial-gradient(circle, oklch(0.75 0.15 50) 0%, transparent 70%)"
                : "radial-gradient(circle, oklch(0.70 0.12 210) 0%, transparent 70%)",
            }}
          />

          {/* Header row */}
          <div className="flex items-center justify-between mb-4 relative">
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

          {/* Centre boat illustration */}
          <div className="flex justify-center mb-4 relative">
            <BoatSVG tilt={boatTilt} imbalanced={imbalanced} />
          </div>

          {/* Member rings row */}
          <div className="flex items-end justify-around gap-4 mb-5 relative">
            {/* Primary */}
            <div className="flex flex-col items-center gap-2">
              <GrowthRing fill={primaryFill} color={primaryColor} size={84}>
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
                    <CrateSVG crateCount={primaryCrates} color={primaryColor} />
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

            {/* Centre divider with anchor motif */}
            <div className="flex flex-col items-center gap-1 pb-7 shrink-0 opacity-30">
              <div className="w-px h-5 bg-border" />
              <span className="text-base">⚓</span>
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
                    <CrateSVG crateCount={partnerCrates} color={partnerColor} />
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
                : "bg-white/50 border border-sky-100/60"
            }`}
          >
            <span className="text-sm leading-none mt-0.5 shrink-0">{sentence.icon}</span>
            <p
              className={`text-xs leading-relaxed ${
                imbalanced ? "text-orange-700" : "text-sky-700"
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
