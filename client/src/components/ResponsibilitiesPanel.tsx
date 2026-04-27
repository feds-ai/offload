import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, X, Anchor, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Member {
  id: number;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
}

interface Responsibility {
  id: number;
  ownerMemberId: number;
  title: string;
  category: string;
  source: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  childcare: "👶",
  transport: "🚗",
  admin: "📋",
  health: "🏥",
  home: "🏠",
  food: "🛒",
  finance: "💰",
  social: "🎉",
  other: "📌",
  general: "📌",
};

export default function ResponsibilitiesPanel() {
  const { token, members } = useHousehold();
  const [expanded, setExpanded] = useState(false);
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const utils = trpc.useUtils();

  const { data: responsibilities, isLoading } = trpc.responsibilities.list.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const syncMutation = trpc.responsibilities.syncFromRhythm.useMutation({
    onSuccess: (data) => {
      utils.responsibilities.list.invalidate();
      utils.load.scores.invalidate();
      if (data.added > 0) {
        toast.success(`Synced ${data.added} responsibilities from your household rhythm.`);
      } else {
        toast.info("No recurring responsibilities found in your rhythm.");
      }
    },
    onError: () => toast.error("Failed to sync from rhythm."),
  });

  const addMutation = trpc.responsibilities.add.useMutation({
    onSuccess: () => {
      utils.responsibilities.list.invalidate();
      utils.load.scores.invalidate();
      setAddingFor(null);
      setNewTitle("");
    },
    onError: () => toast.error("Failed to add responsibility."),
  });

  const deleteMutation = trpc.responsibilities.delete.useMutation({
    onSuccess: () => {
      utils.responsibilities.list.invalidate();
      utils.load.scores.invalidate();
    },
    onError: () => toast.error("Failed to remove responsibility."),
  });

  function handleAdd(memberId: number) {
    if (!newTitle.trim() || !token) return;
    addMutation.mutate({ token, ownerMemberId: memberId, title: newTitle.trim() });
  }

  function handleSync() {
    if (!token || !members.length) return;
    const primary = members.find((m) => m.role === "primary");
    const partner = members.find((m) => m.role === "partner");
    syncMutation.mutate({
      token,
      primaryName: primary?.displayName ?? "",
      partnerName: partner?.displayName ?? "",
    });
  }

  const total = responsibilities?.length ?? 0;

  return (
    <div className="card-glass rounded-2xl overflow-hidden">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-primary/4 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Anchor className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-foreground">Ongoing Responsibilities</span>
            <span className="text-xs text-muted-foreground mt-0.5">
              {total === 0 ? "Permanent mental load items" : `${total} item${total !== 1 ? "s" : ""} always on the plate`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-primary/10 text-primary border-0">
              {total}
            </Badge>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-4">
          {/* Sync from rhythm button */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              These never get completed — they represent the constant background load each person carries.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 ml-2 gap-1.5 text-xs text-muted-foreground h-7 px-2"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync from rhythm
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-2">Loading...</div>
          ) : (
            <div className="space-y-4">
              {(members as Member[]).map((member) => {
                const memberItems = (responsibilities ?? []).filter(
                  (r: Responsibility) => r.ownerMemberId === member.id
                );
                const isAddingHere = addingFor === member.id;

                return (
                  <div key={member.id} className="space-y-2">
                    {/* Member header */}
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-primary">
                            {member.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-foreground">{member.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {memberItems.length === 0 ? "nothing yet" : `${memberItems.length} item${memberItems.length !== 1 ? "s" : ""}`}
                      </span>
                    </div>

                    {/* Items */}
                    {memberItems.length > 0 && (
                      <div className="space-y-1 pl-7">
                        {memberItems.map((r: Responsibility) => (
                          <div
                            key={r.id}
                            className="flex items-center gap-2 group"
                          >
                            <span className="text-sm leading-none">
                              {CATEGORY_EMOJI[r.category] ?? "📌"}
                            </span>
                            <span className="text-sm text-foreground flex-1">{r.title}</span>
                            {r.source === "rhythm" && (
                              <span className="text-[10px] text-muted-foreground/60 italic">rhythm</span>
                            )}
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => deleteMutation.mutate({ token: token!, id: r.id })}
                              aria-label="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add form */}
                    {isAddingHere ? (
                      <div className="pl-7 flex gap-2">
                        <Input
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g. School run, Grocery shop..."
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAdd(member.id);
                            if (e.key === "Escape") { setAddingFor(null); setNewTitle(""); }
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => handleAdd(member.id)}
                          disabled={!newTitle.trim() || addMutation.isPending}
                        >
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => { setAddingFor(null); setNewTitle(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="pl-7 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => { setAddingFor(member.id); setNewTitle(""); }}
                      >
                        <Plus className="w-3 h-3" />
                        Add responsibility for {member.displayName}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
