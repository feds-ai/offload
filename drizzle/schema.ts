import {
  boolean,
  float,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Household ───────────────────────────────────────────────────────────────

export const households = mysqlTable("households", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  imbalanceThreshold: float("imbalanceThreshold").default(0.6).notNull(), // 0.6 = 60%
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Household = typeof households.$inferSelect;

// ─── Household Members (carers) ───────────────────────────────────────────────

export const householdMembers = mysqlTable("household_members", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  userId: int("userId"),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  role: mysqlEnum("role", ["primary", "partner"]).default("primary").notNull(),
  googleCalendarToken: text("googleCalendarToken"), // encrypted JSON
  avatarUrl: text("avatarUrl"), // S3 storage URL for profile picture
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HouseholdMember = typeof householdMembers.$inferSelect;

// ─── Household Rhythm ─────────────────────────────────────────────────────────

export const householdRhythm = mysqlTable("household_rhythm", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull().unique(),
  rawText: text("rawText").notNull(),
  structuredData: json("structuredData"), // parsed schedule JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HouseholdRhythm = typeof householdRhythm.$inferSelect;

// ─── Routing Rules ────────────────────────────────────────────────────────────

export const routingRules = mysqlTable("routing_rules", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 64 }), // kids, self, partner, pet, any
  qualifier: varchar("qualifier", { length: 128 }), // e.g. dental, car
  assigneeMemberId: int("assigneeMemberId").notNull(),
  source: mysqlEnum("source", ["onboarding", "learned", "manual"]).default("onboarding").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RoutingRule = typeof routingRules.$inferSelect;

// ─── Dismissed Inference Types ────────────────────────────────────────────────

export const dismissedInferenceTypes = mysqlTable("dismissed_inference_types", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  inferenceType: varchar("inferenceType", { length: 128 }).notNull(), // e.g. "arrange_travel"
  label: varchar("label", { length: 255 }).notNull(), // human-readable
  dismissCount: int("dismissCount").notNull().default(1), // incremented on each deletion; silenced at 3
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DismissedInferenceType = typeof dismissedInferenceTypes.$inferSelect;

// ─── Events ───────────────────────────────────────────────────────────────────

export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 512 }),
  startTime: timestamp("startTime"),
  endTime: timestamp("endTime"),
  subjectName: varchar("subjectName", { length: 128 }), // e.g. "Mia", "Julian"
  googleEventIdPrimary: varchar("googleEventIdPrimary", { length: 256 }),
  googleEventIdPartner: varchar("googleEventIdPartner", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Event = typeof events.$inferSelect;

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  eventId: int("eventId"), // optional link to parent event
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  subject: varchar("subject", { length: 64 }).default("any"), // kids, self, partner, pet, any
  qualifier: varchar("qualifier", { length: 128 }),
  ownerMemberId: int("ownerMemberId").notNull(),
  status: mysqlEnum("status", ["open", "snoozed", "done"]).default("open").notNull(),
  deadline: timestamp("deadline"),
  urgency: mysqlEnum("urgency", ["low", "medium", "high"]).default("medium").notNull(),
  urgencyOverridden: boolean("urgencyOverridden").default(false).notNull(),
  isRecurringSuggestion: boolean("isRecurringSuggestion").default(false).notNull(),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  lowConfidence: boolean("lowConfidence").default(false).notNull(),
  googleEventId: varchar("googleEventId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Responsibilities ─────────────────────────────────────────────────────────
// Permanent mental-load items that always weigh on an owner.
// They are never "completed" — they exist as long as someone owns them.

export const responsibilities = mysqlTable("responsibilities", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  ownerMemberId: int("ownerMemberId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  source: mysqlEnum("source", ["rhythm", "manual"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Responsibility = typeof responsibilities.$inferSelect;
export type InsertResponsibility = typeof responsibilities.$inferInsert;
