import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useHousehold } from "@/contexts/HouseholdContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, Repeat2, Trash2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  time?: string;
  isRecurring: boolean;
  person?: string; // "primary" | "partner" | name
  subjectName?: string;
  location?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DOW_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function parseDow(dayOfWeek: string): number | null {
  const key = dayOfWeek.toLowerCase().trim();
  return DOW_MAP[key] ?? null;
}

function nextOccurrence(dow: number, from: Date): Date {
  const d = new Date(from);
  const diff = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HouseholdCalendar() {
  const { token, members } = useHousehold();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data: eventsData } = trpc.events.list.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const { data: rhythmData } = trpc.settings.getRhythm.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  // ─── Build calendar events list ───────────────────────────────────────────

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    // One-off events from the events table
    if (eventsData) {
      for (const ev of eventsData) {
        if (!ev.startTime) continue;
        const d = new Date(ev.startTime);
        result.push({
          id: `ev-${ev.id}`,
          title: ev.title,
          date: d,
          endDate: ev.endTime ? new Date(ev.endTime) : undefined,
          time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isRecurring: false,
          subjectName: ev.subjectName ?? undefined,
          location: ev.location ?? undefined,
        });
      }
    }

    // Recurring rhythm entries — expand into the current month ± 1
    if (rhythmData?.structuredData) {
      const rhythm = rhythmData.structuredData as { entries?: Array<{ person: string; activity: string; dayOfWeek: string; time?: string; notes?: string }> };
      if (Array.isArray(rhythm.entries)) {
        // Generate occurrences for a 3-month window centred on current month
        const windowStart = new Date(year, month - 1, 1);
        const windowEnd = new Date(year, month + 2, 0);
        for (const entry of rhythm.entries) {
          const dow = parseDow(entry.dayOfWeek);
          if (dow === null) continue;
          let cursor = nextOccurrence(dow, windowStart);
          while (cursor <= windowEnd) {
            result.push({
              id: `rhythm-${entry.activity}-${cursor.toISOString()}`,
              title: entry.activity,
              date: new Date(cursor),
              time: entry.time,
              isRecurring: true,
              person: entry.person,
            });
            cursor = new Date(cursor);
            cursor.setDate(cursor.getDate() + 7);
          }
        }
      }
    }

    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [eventsData, rhythmData, year, month]);

  // ─── Calendar grid helpers ────────────────────────────────────────────────

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  function eventsOnDay(day: number): CalendarEvent[] {
    return calendarEvents.filter((ev) => {
      const d = ev.date;
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const selectedEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  // ─── Delete event mutation ────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const deleteEventMutation = trpc.events.delete.useMutation({
    onSuccess: () => {
      utils.events.list.invalidate();
      toast.success("Event removed");
      // Clear selected day if it now has no events
      if (selectedDay) {
        const remaining = eventsOnDay(selectedDay).filter(
          (ev) => !ev.isRecurring
        );
        if (remaining.length <= 1) setSelectedDay(null);
      }
    },
    onError: () => toast.error("Failed to remove event"),
  });

  // ─── Upcoming events list (next 14 days, one-off only) ───────────────────

  const upcoming = useMemo(() => {
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    // Only show one-off events in upcoming list — rhythm is too noisy
    return calendarEvents.filter((ev) => !ev.isRecurring && ev.date >= now && ev.date <= twoWeeks);
  }, [calendarEvents]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Month navigator */}
      <div className="card-glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold text-foreground">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {/* Leading empty cells */}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = eventsOnDay(day);
            const isToday =
              today.getFullYear() === year &&
              today.getMonth() === month &&
              today.getDate() === day;
            const isSelected = selectedDay === day;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`relative flex flex-col items-center justify-start pt-1 pb-1.5 rounded-xl transition-all min-h-[44px] ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isToday
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-muted/60 text-foreground"
                }`}
              >
                <span className="text-xs leading-none">{day}</span>
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          ev.isRecurring
                            ? isSelected ? "bg-primary-foreground/60" : "bg-teal-400"
                            : isSelected ? "bg-primary-foreground" : "bg-primary"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            One-off event
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
            Weekly rhythm
          </div>
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="card-glass rounded-2xl p-4 space-y-3">
          <div className="section-label">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            {MONTH_NAMES[month]} {selectedDay}
          </div>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((ev) => (
                <EventRow
                  key={ev.id}
                  ev={ev}
                  members={members}
                  onDelete={(id) => deleteEventMutation.mutate({ token: token ?? "", eventId: id })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming 14 days */}
      {upcoming.length > 0 && (
        <div className="card-glass rounded-2xl p-4 space-y-3">
          <div className="section-label">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            Next 14 days
          </div>
          <div className="space-y-2">
            {upcoming.map((ev) => (
              <EventRow
                key={ev.id}
                ev={ev}
                members={members}
                onDelete={(id) => deleteEventMutation.mutate({ token: token ?? "", eventId: id })}
              />
            ))}
          </div>
        </div>
      )}

      {upcoming.length === 0 && !selectedDay && (
        <div className="text-center py-12 space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-white/70 shadow-sm border border-border/50 text-3xl backdrop-blur-sm">
            📅
          </div>
          <p className="text-sm font-semibold text-foreground">Nothing coming up</p>
          <p className="text-xs text-muted-foreground">
            Events you offload and your weekly rhythm will appear here.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── EventRow ─────────────────────────────────────────────────────────────────

function EventRow({
  ev,
  members,
  onDelete,
}: {
  ev: CalendarEvent;
  members: Array<{ id: number; displayName: string; role: string }>;
  onDelete?: (id: number) => void;
}) {
  const personLabel = ev.person
    ? members.find((m) => m.role === ev.person)?.displayName ?? ev.person
    : undefined;

  return (
      <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/50 border border-border/30 group">
      <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
        ev.isRecurring ? "bg-teal-50 text-teal-600" : "bg-primary/10 text-primary"
      }`}>
        {ev.isRecurring ? (
          <Repeat2 className="w-3.5 h-3.5" />
        ) : (
          <CalendarDays className="w-3.5 h-3.5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">
          {ev.title}
          {ev.subjectName && (
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">· {ev.subjectName}</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {ev.time && (
            <span className="text-xs text-muted-foreground">{ev.time}</span>
          )}
          {ev.location && (
            <span className="text-xs text-muted-foreground">📍 {ev.location}</span>
          )}
          {personLabel && (
            <span className="text-xs text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded-full">
              {personLabel}
            </span>
          )}
        </div>
      </div>
      {onDelete && !ev.isRecurring && (
        <button
          onClick={() => onDelete(Number(ev.id.replace("ev-", "")))}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 shrink-0"
          title="Remove event"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
