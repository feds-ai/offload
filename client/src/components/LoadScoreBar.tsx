import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import { AlertTriangle, Settings } from "lucide-react";
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

export default function LoadScoreBar() {
  const { household, members } = useHousehold();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threshold, setThreshold] = useState<number[]>([
    Math.round((household?.imbalanceThreshold ?? 0.6) * 100),
  ]);

  const { data: loadData, refetch } = trpc.load.scores.useQuery(
    { householdId: household?.id ?? 0 },
    { enabled: !!household?.id, refetchInterval: 30000 }
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
  const primary = scores.find((s) => s.member.role === "primary");
  const partner = scores.find((s) => s.member.role === "partner");

  const primaryPct = totalScore > 0 ? Math.round((primary?.score ?? 0) / totalScore * 100) : 50;
  const partnerPct = totalScore > 0 ? Math.round((partner?.score ?? 0) / totalScore * 100) : 50;

  async function saveThreshold() {
    if (!household) return;
    await updateThreshold.mutateAsync({
      householdId: household.id,
      threshold: threshold[0] / 100,
    });
  }

  return (
    <>
      <div className={`rounded-2xl p-4 border transition-all ${
        imbalanced
          ? "bg-orange-50 border-orange-200"
          : "bg-card border-border"
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Mental Load</span>
            {imbalanced && (
              <div className="flex items-center gap-1 text-orange-600 text-xs font-medium bg-orange-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                Imbalanced
              </div>
            )}
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Load bar */}
        <div className="h-3 rounded-full bg-muted overflow-hidden flex mb-3">
          <div
            className="h-full load-bar-primary transition-all duration-500 rounded-l-full"
            style={{ width: `${primaryPct}%` }}
          />
          <div
            className="h-full load-bar-partner transition-all duration-500 rounded-r-full"
            style={{ width: `${partnerPct}%` }}
          />
        </div>

        {/* Labels */}
        <div className="flex justify-between text-xs">
          {scores.map((s) => (
            <div key={s.member.id} className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-foreground">{s.member.displayName}</span>
              <span className="text-muted-foreground">{s.openCount} open task{s.openCount !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>

        {/* Imbalance message */}
        {imbalanced && (
          <div className="mt-3 pt-3 border-t border-orange-200 text-xs text-orange-700">
            <p className="font-medium">Worth a conversation? 💬</p>
            <p className="text-orange-600 mt-0.5">
              One person is carrying most of the load right now.
            </p>
          </div>
        )}
      </div>

      {/* Threshold settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load imbalance threshold</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Show the imbalance signal when one person carries more than this share of the total load.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Threshold</span>
                <span className="font-semibold text-foreground">{threshold[0]}% / {100 - threshold[0]}%</span>
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
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={saveThreshold} disabled={updateThreshold.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
