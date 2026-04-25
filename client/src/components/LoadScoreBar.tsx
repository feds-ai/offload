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

  return (
    <>
      <div
        className={`rounded-2xl overflow-hidden border transition-all ${
          imbalanced ? "border-orange-200" : "border-border"
        }`}
      >
        {/* Gradient header band */}
        <div
          className={`px-4 pt-4 pb-3 ${
            imbalanced
              ? "bg-gradient-to-br from-orange-50 to-amber-50"
              : "bg-gradient-to-br from-teal-50/60 to-emerald-50/40"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Mental Load
              </span>
              {imbalanced && (
                <span className="inline-flex items-center gap-1 text-orange-600 text-xs font-medium bg-orange-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Check in
                </span>
              )}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-black/5 transition-colors"
              title="Adjust threshold"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Avatar + percentage row */}
          <div className="flex items-center gap-3 mb-3">
            {/* Primary person */}
            <div className="flex items-center gap-2 flex-1">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {primary ? initials(primary.member.displayName) : "?"}
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
                className={`ml-auto text-lg font-bold tabular-nums ${
                  imbalanced && primaryPct > partnerPct
                    ? "text-orange-500"
                    : "text-primary"
                }`}
              >
                {primaryPct}%
              </span>
            </div>

            <div className="w-px h-8 bg-border/60" />

            {/* Partner */}
            <div className="flex items-center gap-2 flex-1">
              <span
                className={`mr-auto text-lg font-bold tabular-nums ${
                  imbalanced && partnerPct > primaryPct
                    ? "text-orange-500"
                    : "text-teal-600"
                }`}
              >
                {partnerPct}%
              </span>
              <div className="min-w-0 text-right">
                <p className="text-xs font-semibold text-foreground truncate">
                  {partner?.member.displayName ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {partner?.openCount ?? 0} task{(partner?.openCount ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">
                {partner ? initials(partner.member.displayName) : "?"}
              </div>
            </div>
          </div>

          {/* Segmented load bar */}
          <div className="h-2.5 rounded-full bg-black/5 overflow-hidden flex gap-0.5">
            <div
              className="h-full rounded-l-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${primaryPct}%` }}
            />
            <div
              className="h-full rounded-r-full bg-teal-400 transition-all duration-700 ease-out"
              style={{ width: `${partnerPct}%` }}
            />
          </div>
        </div>

        {/* Imbalance nudge */}
        {imbalanced && (
          <div className="px-4 py-2.5 bg-orange-50 border-t border-orange-100 flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">💬</span>
            <p className="text-xs text-orange-700 leading-relaxed">
              <span className="font-semibold">Worth a conversation?</span> One person is carrying
              most of the load right now.
            </p>
          </div>
        )}
      </div>

      {/* Threshold settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load imbalance sensitivity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Show the imbalance signal when one person carries more than this share of the total
              load.
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
