import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
import {
  dismissedInferenceTypes,
  events,
  householdMembers,
  householdRhythm,
  households,
  InsertTask,
  InsertUser,
  routingRules,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
const LOCAL_DB_PATH = path.resolve(process.cwd(), ".manus/db/local-dev.json");

type LocalState = {
  counters: Record<string, number>;
  households: any[];
  householdMembers: any[];
  householdRhythm: any[];
  routingRules: any[];
  dismissedInferenceTypes: any[];
  tasks: any[];
  events: any[];
  users: any[];
};

let _localState: LocalState | null = null;

function isLocalDevDbMode() {
  return !process.env.DATABASE_URL;
}

function getLocalState(): LocalState {
  if (_localState) return _localState;
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    _localState = JSON.parse(raw) as LocalState;
  } catch {
    _localState = {
      counters: {},
      households: [],
      householdMembers: [],
      householdRhythm: [],
      routingRules: [],
      dismissedInferenceTypes: [],
      tasks: [],
      events: [],
      users: [],
    };
  }
  return _localState!;
}

function saveLocalState() {
  if (!_localState) return;
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(_localState, null, 2));
}

function nextId(state: LocalState, key: string) {
  state.counters[key] = (state.counters[key] ?? 0) + 1;
  return state.counters[key];
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Households ───────────────────────────────────────────────────────────────

export async function createHousehold(name: string, shareToken: string) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const row = {
      id: nextId(s, "households"),
      name,
      shareToken,
      imbalanceThreshold: 0.6,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    s.households.push(row);
    saveLocalState();
    return row as any;
  }
  if (!db) throw new Error("DB unavailable");
  await db.insert(households).values({ name, shareToken });
  const result = await db.select().from(households).where(eq(households.shareToken, shareToken)).limit(1);
  return result[0];
}

export async function getHouseholdByToken(shareToken: string) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().households.find((h) => h.shareToken === shareToken);
  }
  if (!db) return undefined;
  const result = await db.select().from(households).where(eq(households.shareToken, shareToken)).limit(1);
  return result[0];
}

export async function getHouseholdById(id: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().households.find((h) => h.id === id);
  }
  if (!db) return undefined;
  const result = await db.select().from(households).where(eq(households.id, id)).limit(1);
  return result[0];
}

export async function updateHouseholdThreshold(householdId: number, threshold: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const row = s.households.find((h) => h.id === householdId);
    if (!row) throw new Error("Household not found");
    row.imbalanceThreshold = threshold;
    row.updatedAt = new Date();
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db.update(households).set({ imbalanceThreshold: threshold }).where(eq(households.id, householdId));
}

// ─── Household Members ────────────────────────────────────────────────────────

export async function createHouseholdMember(
  householdId: number,
  userId: number | null,
  displayName: string,
  role: "primary" | "partner"
) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const row = {
      id: nextId(s, "householdMembers"),
      householdId,
      userId: userId ?? null,
      displayName,
      role,
      googleCalendarToken: null,
      createdAt: new Date(),
    };
    s.householdMembers.push(row);
    saveLocalState();
    return row as any;
  }
  if (!db) throw new Error("DB unavailable");
  await db.insert(householdMembers).values({ householdId, userId: userId ?? undefined, displayName, role });
  const result = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(desc(householdMembers.createdAt))
    .limit(1);
  return result[0];
}

export async function getMembersByHousehold(householdId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().householdMembers.filter((m) => m.householdId === householdId);
  }
  if (!db) return [];
  return db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
}

export async function getMemberByUserId(userId: number | null, householdId: number) {
  if (userId === null) return undefined;
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.id, userId)))
    .limit(1);
  return result[0];
}

export async function getMemberById(memberId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().householdMembers.find((m) => m.id === memberId);
  }
  if (!db) return undefined;
  const result = await db.select().from(householdMembers).where(eq(householdMembers.id, memberId)).limit(1);
  return result[0];
}

export async function updateMemberCalendarToken(memberId: number, token: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(householdMembers).set({ googleCalendarToken: token }).where(eq(householdMembers.id, memberId));
}

export async function updateMemberAvatar(memberId: number, avatarUrl: string | null) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const member = s.householdMembers.find((m) => m.id === memberId);
    if (!member) throw new Error("Member not found");
    member.avatarUrl = avatarUrl;
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db.update(householdMembers).set({ avatarUrl }).where(eq(householdMembers.id, memberId));
}

// ─── Household Rhythm ─────────────────────────────────────────────────────────

export async function upsertHouseholdRhythm(
  householdId: number,
  rawText: string,
  structuredData: unknown
) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const existing = s.householdRhythm.find((r) => r.householdId === householdId);
    if (existing) {
      existing.rawText = rawText;
      existing.structuredData = structuredData;
      existing.updatedAt = new Date();
    } else {
      s.householdRhythm.push({
        id: nextId(s, "householdRhythm"),
        householdId,
        rawText,
        structuredData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(householdRhythm)
    .values({ householdId, rawText, structuredData })
    .onDuplicateKeyUpdate({ set: { rawText, structuredData } });
}

export async function getHouseholdRhythm(householdId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().householdRhythm.find((r) => r.householdId === householdId);
  }
  if (!db) return undefined;
  const result = await db.select().from(householdRhythm).where(eq(householdRhythm.householdId, householdId)).limit(1);
  return result[0];
}

// ─── Routing Rules ────────────────────────────────────────────────────────────

export async function getRoutingRules(householdId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().routingRules.filter((r) => r.householdId === householdId);
  }
  if (!db) return [];
  return db.select().from(routingRules).where(eq(routingRules.householdId, householdId));
}

export async function createRoutingRule(
  householdId: number,
  category: string,
  subject: string | null,
  qualifier: string | null,
  assigneeMemberId: number,
  source: "onboarding" | "learned" | "manual" = "onboarding"
) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    s.routingRules.push({
      id: nextId(s, "routingRules"),
      householdId,
      category,
      subject,
      qualifier,
      assigneeMemberId,
      source,
      createdAt: new Date(),
    });
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db.insert(routingRules).values({ householdId, category, subject, qualifier, assigneeMemberId, source });
}

export async function deleteRoutingRule(ruleId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    s.routingRules = s.routingRules.filter((r) => r.id !== ruleId);
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db.delete(routingRules).where(eq(routingRules.id, ruleId));
}

// ─── Dismissed Inference Types ────────────────────────────────────────────────

export async function getDismissedInferenceTypes(householdId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().dismissedInferenceTypes.filter((d) => d.householdId === householdId);
  }
  if (!db) return [];
  return db.select().from(dismissedInferenceTypes).where(eq(dismissedInferenceTypes.householdId, householdId));
}

/**
 * Upsert a dismissed inference type, incrementing the count on each call.
 * Returns the new dismissCount so callers can decide whether to show the toast.
 */
export async function dismissInferenceType(
  householdId: number,
  inferenceType: string,
  label: string
): Promise<number> {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const existing = s.dismissedInferenceTypes.find(
      (d) => d.householdId === householdId && d.inferenceType === inferenceType
    );
    if (existing) {
      existing.dismissCount += 1;
      existing.label = label;
      saveLocalState();
      return existing.dismissCount;
    }
    s.dismissedInferenceTypes.push({
      id: nextId(s, "dismissedInferenceTypes"),
      householdId,
      inferenceType,
      label,
      dismissCount: 1,
      createdAt: new Date(),
    });
    saveLocalState();
    return 1;
  }
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(dismissedInferenceTypes)
    .where(
      and(
        eq(dismissedInferenceTypes.householdId, householdId),
        eq(dismissedInferenceTypes.inferenceType, inferenceType)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    const newCount = existing[0].dismissCount + 1;
    await db
      .update(dismissedInferenceTypes)
      .set({ dismissCount: newCount, label })
      .where(
        and(
          eq(dismissedInferenceTypes.householdId, householdId),
          eq(dismissedInferenceTypes.inferenceType, inferenceType)
        )
      );
    return newCount;
  } else {
    await db.insert(dismissedInferenceTypes).values({ householdId, inferenceType, label, dismissCount: 1 });
    return 1;
  }
}

export async function restoreInferenceType(householdId: number, inferenceType: string) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    s.dismissedInferenceTypes = s.dismissedInferenceTypes.filter(
      (d) => !(d.householdId === householdId && d.inferenceType === inferenceType)
    );
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(dismissedInferenceTypes)
    .where(
      and(
        eq(dismissedInferenceTypes.householdId, householdId),
        eq(dismissedInferenceTypes.inferenceType, inferenceType)
      )
    );
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function createEvent(
  householdId: number,
  data: {
    title: string;
    description?: string;
    location?: string;
    startTime?: Date;
    endTime?: Date;
    subjectName?: string;
  }
) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const row = {
      id: nextId(s, "events"),
      householdId,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    s.events.push(row);
    saveLocalState();
    return row as any;
  }
  if (!db) throw new Error("DB unavailable");
  await db.insert(events).values({ householdId, ...data });
  const result = await db
    .select()
    .from(events)
    .where(eq(events.householdId, householdId))
    .orderBy(desc(events.createdAt))
    .limit(1);
  return result[0];
}

export async function getEventsByHousehold(householdId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState()
      .events.filter((e) => e.householdId === householdId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (!db) return [];
  return db.select().from(events).where(eq(events.householdId, householdId)).orderBy(desc(events.createdAt));
}

export async function updateEventGoogleIds(
  eventId: number,
  googleEventIdPrimary?: string,
  googleEventIdPartner?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(events)
    .set({ googleEventIdPrimary, googleEventIdPartner })
    .where(eq(events.id, eventId));
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const row = {
      id: nextId(s, "tasks"),
      eventId: null,
      status: "open",
      deadline: null,
      urgency: "medium",
      urgencyOverridden: false,
      isRecurringSuggestion: false,
      isRecurring: false,
      lowConfidence: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    s.tasks.push(row);
    saveLocalState();
    return row as any;
  }
  if (!db) throw new Error("DB unavailable");
  await db.insert(tasks).values(data);
  const result = await db
    .select()
    .from(tasks)
    .where(eq(tasks.householdId, data.householdId))
    .orderBy(desc(tasks.createdAt))
    .limit(1);
  return result[0];
}

export async function getTasksByHousehold(householdId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState()
      .tasks.filter((t) => t.householdId === householdId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.householdId, householdId)))
    .orderBy(desc(tasks.createdAt));
}

export async function getTasksByMember(householdId: number, memberId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState()
      .tasks.filter((t) => t.householdId === householdId && t.ownerMemberId === memberId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.householdId, householdId), eq(tasks.ownerMemberId, memberId)))
    .orderBy(desc(tasks.createdAt));
}

export async function updateTask(
  taskId: number,
  data: Partial<{
    title: string;
    description: string;
    category: string;
    subject: string;
    qualifier: string;
    ownerMemberId: number;
    status: "open" | "snoozed" | "done";
    deadline: Date | null;
    urgency: "low" | "medium" | "high";
    urgencyOverridden: boolean;
    isRecurring: boolean;
    googleEventId: string;
  }>
) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    const task = s.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found");
    Object.assign(task, data, { updatedAt: new Date() });
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set(data).where(eq(tasks.id, taskId));
}

export async function deleteEvent(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(events).where(eq(events.id, eventId));
}

export async function deleteTask(taskId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    const s = getLocalState();
    s.tasks = s.tasks.filter((t) => t.id !== taskId);
    saveLocalState();
    return;
  }
  if (!db) throw new Error("DB unavailable");
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

export async function getTaskById(taskId: number) {
  const db = await getDb();
  if (!db && isLocalDevDbMode()) {
    return getLocalState().tasks.find((t) => t.id === taskId);
  }
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return result[0];
}

// ─── Load score helpers ───────────────────────────────────────────────────────

const URGENCY_WEIGHTS = { high: 3, medium: 2, low: 1 };

export function computeLoadScore(memberTasks: Array<{ urgency: string; status: string }>) {
  return memberTasks
    .filter((t) => t.status === "open")
    .reduce((sum, t) => sum + (URGENCY_WEIGHTS[t.urgency as keyof typeof URGENCY_WEIGHTS] ?? 1), 0);
}
