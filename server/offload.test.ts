import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createHousehold: vi.fn().mockResolvedValue({
      id: 1,
      name: "Test Household",
      shareToken: "test-token-abc",
      imbalanceThreshold: 0.6,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    createHouseholdMember: vi.fn().mockResolvedValue({
      id: 1,
      householdId: 1,
      userId: null,
      displayName: "Sarah",
      role: "primary",
      googleCalendarToken: null,
      createdAt: new Date(),
    }),
    getHouseholdByToken: vi.fn().mockResolvedValue({
      id: 1,
      name: "Test Household",
      shareToken: "test-token-abc",
      imbalanceThreshold: 0.6,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getMembersByHousehold: vi.fn().mockResolvedValue([
      { id: 1, householdId: 1, userId: null, displayName: "Sarah", role: "primary", googleCalendarToken: null, createdAt: new Date() },
      { id: 2, householdId: 1, userId: null, displayName: "James", role: "partner", googleCalendarToken: null, createdAt: new Date() },
    ]),
    getMemberByUserId: vi.fn().mockResolvedValue(null),
    getMemberById: vi.fn().mockResolvedValue(
      { id: 1, householdId: 1, userId: null, displayName: "Sarah", role: "primary", googleCalendarToken: null, createdAt: new Date() }
    ),
    getHouseholdById: vi.fn().mockResolvedValue({
      id: 1, name: "Test Household", shareToken: "test-token-abc", imbalanceThreshold: 0.6, createdAt: new Date(), updatedAt: new Date(),
    }),
    getTasksByHousehold: vi.fn().mockResolvedValue([
      { id: 1, householdId: 1, ownerMemberId: 1, title: "Buy present", status: "open", urgency: "medium", deadline: null, category: "social", subject: "kids", isRecurring: false, lowConfidence: false, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, householdId: 1, ownerMemberId: 2, title: "Book dentist", status: "open", urgency: "low", deadline: null, category: "medical", subject: "kids", isRecurring: false, lowConfidence: false, createdAt: new Date(), updatedAt: new Date() },
    ]),
    getTasksByMember: vi.fn().mockResolvedValue([
      { id: 1, householdId: 1, ownerMemberId: 1, title: "Buy present", status: "open", urgency: "medium", deadline: null, category: "social", subject: "kids", isRecurring: false, lowConfidence: false, createdAt: new Date(), updatedAt: new Date() },
    ]),
    computeLoadScore: vi.fn().mockReturnValue(5),
    createTask: vi.fn().mockResolvedValue({ id: 3, title: "New task", status: "open" }),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    createEvent: vi.fn().mockResolvedValue({ id: 1, title: "Birthday party", householdId: 1 }),
    getEventsByHousehold: vi.fn().mockResolvedValue([]),
    getRoutingRules: vi.fn().mockResolvedValue([]),
    createRoutingRule: vi.fn().mockResolvedValue(undefined),
    deleteRoutingRule: vi.fn().mockResolvedValue(undefined),
    getDismissedInferenceTypes: vi.fn().mockResolvedValue([]),
    dismissInferenceType: vi.fn().mockResolvedValue(undefined),
    restoreInferenceType: vi.fn().mockResolvedValue(undefined),
    updateHouseholdThreshold: vi.fn().mockResolvedValue(undefined),
    updateMemberCalendarToken: vi.fn().mockResolvedValue(undefined),
    upsertHouseholdRhythm: vi.fn().mockResolvedValue(undefined),
    upsertUser: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./ai", () => ({
  extractFromText: vi.fn().mockResolvedValue({
    events: [{ title: "Lily's birthday party", startTime: "2026-06-14T15:00:00Z" }],
    tasks: [{ title: "Buy birthday present", category: "social", subject: "kids", urgency: "medium", isRecurringSuggestion: false, lowConfidence: false }],
    birthdayPresents: ["Lego set", "Art kit", "Book about dinosaurs"],
  }),
  extractTextFromImageUrl: vi.fn().mockResolvedValue("School trip notice text"),
  parseHouseholdRhythm: vi.fn().mockResolvedValue({ events: [] }),
  parseRoutingExceptions: vi.fn().mockResolvedValue({ rules: [] }),
  suggestRouting: vi.fn().mockResolvedValue({ assignee: "primary", confidence: "high", reasoning: "School tasks go to Sarah" }),
  transcribeVoiceNote: vi.fn().mockResolvedValue("Mia has swimming on Wednesday"),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "temp/test.jpg", url: "/manus-storage/temp/test.jpg" }),
}));

// ─── Test context helpers ─────────────────────────────────────────────────────

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const TEST_TOKEN = "test-token-abc";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("household.create", () => {
  it("creates a household and primary member", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.household.create({ primaryName: "Sarah", partnerName: "James" });
    expect(result.household.name).toBeTruthy();
    expect(result.primaryMember.displayName).toBe("Sarah");
    expect(result.primaryMember.role).toBe("primary");
  });
});

describe("household.getByToken", () => {
  it("returns household and members for a valid token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.household.getByToken({ token: TEST_TOKEN });
    expect(result.household.shareToken).toBe(TEST_TOKEN);
    expect(result.members).toHaveLength(2);
  });
});

describe("extract.fromText", () => {
  it("extracts events and tasks from text", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.extract.fromText({
      token: TEST_TOKEN,
      text: "Mia is invited to Lily's birthday party on 14 June at 3pm",
    });
    expect(result.events).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.birthdayPresents).toHaveLength(3);
  });
});

describe("tasks", () => {
  it("lists all tasks for a household", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const tasks = await caller.tasks.list({ token: TEST_TOKEN });
    expect(tasks).toHaveLength(2);
  });

  it("lists only tasks for a specific member", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const tasks = await caller.tasks.listMine({ token: TEST_TOKEN, memberId: 1 });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].ownerMemberId).toBe(1);
  });

  it("creates a task", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const task = await caller.tasks.create({
      token: TEST_TOKEN,
      title: "New task",
      category: "general",
      subject: "any",
      ownerMemberId: 1,
      urgency: "medium",
    });
    expect(task).toBeTruthy();
  });

  it("updates a task status to done", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tasks.update({
      token: TEST_TOKEN,
      taskId: 1,
      status: "done",
    });
    expect(result.success).toBe(true);
  });

  it("deletes a task", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tasks.delete({ token: TEST_TOKEN, taskId: 1 });
    expect(result.success).toBe(true);
  });
});

describe("load.scores", () => {
  it("returns load scores for all members", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.load.scores({ token: TEST_TOKEN });
    expect(result.scores).toHaveLength(2);
    expect(typeof result.imbalanced).toBe("boolean");
    expect(result.threshold).toBe(0.6);
  });
});

describe("routing", () => {
  it("suggests routing for a task", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.routing.suggest({
      token: TEST_TOKEN,
      taskTitle: "School trip payment",
      category: "school",
      subject: "kids",
    });
    expect(result.assignee).toBe("primary");
    expect(result.confidence).toBe("high");
  });

  it("learns a new routing rule", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.routing.learnRule({
      token: TEST_TOKEN,
      category: "insurance",
      subject: "cars",
      assigneeMemberId: 2,
    });
    expect(result.success).toBe(true);
  });
});
