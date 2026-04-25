import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  computeLoadScore,
  createEvent,
  createHousehold,
  createHouseholdMember,
  createRoutingRule,
  createTask,
  deleteRoutingRule,
  deleteTask,
  dismissInferenceType,
  getDismissedInferenceTypes,
  getEventsByHousehold,
  getHouseholdById,
  getHouseholdByToken,
  getMemberById,
  getMembersByHousehold,
  getRoutingRules,
  getTasksByHousehold,
  getTasksByMember,
  getHouseholdRhythm,
  restoreInferenceType,
  updateEventGoogleIds,
  updateHouseholdThreshold,
  updateMemberAvatar,
  updateMemberCalendarToken,
  updateTask,
  upsertHouseholdRhythm,
} from "./db";
import {
  extractFromText,
  extractTextFromImageUrl,
  parseHouseholdRhythm,
  parseRoutingExceptions,
  suggestRouting,
  transcribeVoiceNote,
} from "./ai";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { transcribeBuffer } from "./transcribeBuffer";
import { createCalendarEvent, exchangeCodeForTokens, isCalendarConfigured } from "./calendar";

// ─── Token-based auth helpers ─────────────────────────────────────────────────

/**
 * Validate a household share token and return the household.
 * This replaces session-based auth — any holder of the token can access the household.
 */
async function requireHousehold(token: string) {
  const household = await getHouseholdByToken(token);
  if (!household) throw new TRPCError({ code: "NOT_FOUND", message: "Household not found" });
  return household;
}

/**
 * Validate a member belongs to the household identified by the token.
 */
async function requireMember(token: string, memberId: number) {
  const household = await requireHousehold(token);
  const member = await getMemberById(memberId);
  if (!member || member.householdId !== household.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Member not found in this household" });
  }
  return { household, member };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ─── Household ─────────────────────────────────────────────────────────────

  household: router({
    // Create a new household during onboarding — no login required
    create: publicProcedure
      .input(
        z.object({
          primaryName: z.string().min(1),
          partnerName: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const shareToken = nanoid(32);
        const household = await createHousehold(
          `${input.primaryName} & ${input.partnerName}'s Household`,
          shareToken
        );
        if (!household) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Create both members immediately — no user account needed
        const primaryMember = await createHouseholdMember(
          household.id,
          null,
          input.primaryName,
          "primary"
        );
        const partnerMember = await createHouseholdMember(
          household.id,
          null,
          input.partnerName,
          "partner"
        );

        return { household, primaryMember, partnerMember };
      }),

    // Get household by share token
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await getHouseholdByToken(input.token);
        if (!household) throw new TRPCError({ code: "NOT_FOUND" });
        const members = await getMembersByHousehold(household.id);
        return { household, members };
      }),

    updateThreshold: publicProcedure
      .input(z.object({ token: z.string(), threshold: z.number().min(0.5).max(1) }))
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        await updateHouseholdThreshold(household.id, input.threshold);
        return { success: true };
      }),
    uploadAvatar: publicProcedure
      .input(
        z.object({
          token: z.string(),
          memberId: z.number(),
          imageBase64: z.string(), // base64-encoded image data
          mimeType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const members = await getMembersByHousehold(household.id);
        const member = members.find((m) => m.id === input.memberId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.split("/")[1] ?? "jpg";
        const key = `avatars/member-${input.memberId}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        await updateMemberAvatar(input.memberId, url);
        return { avatarUrl: url };
      }),
  }),

  // ─── Onboarding ────────────────────────────────────────────────────────────

  onboarding: router({
    saveRhythm: publicProcedure
      .input(
        z.object({
          token: z.string(),
          rawText: z.string().min(1),
          primaryName: z.string(),
          partnerName: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const structured = await parseHouseholdRhythm(input.rawText, input.primaryName, input.partnerName);
        await upsertHouseholdRhythm(household.id, input.rawText, structured);
        return { structured };
      }),

    saveDomainAssignment: publicProcedure
      .input(
        z.object({
          token: z.string(),
          assignments: z.array(
            z.object({
              category: z.string(),
              assignee: z.enum(["primary", "partner", "ask"]),
            })
          ),
          primaryMemberId: z.number(),
          partnerMemberId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        for (const a of input.assignments) {
          if (a.assignee === "ask") continue;
          const memberId = a.assignee === "primary" ? input.primaryMemberId : input.partnerMemberId;
          await createRoutingRule(household.id, a.category, null, null, memberId, "onboarding");
        }
        return { success: true };
      }),

    saveExceptions: publicProcedure
      .input(
        z.object({
          token: z.string(),
          exceptionsText: z.string(),
          primaryName: z.string(),
          partnerName: z.string(),
          primaryMemberId: z.number(),
          partnerMemberId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const parsed = await parseRoutingExceptions(
          input.exceptionsText,
          input.primaryName,
          input.partnerName
        );
        for (const rule of parsed.rules) {
          const memberId = rule.assignee === "primary" ? input.primaryMemberId : input.partnerMemberId;
          await createRoutingRule(
            household.id,
            rule.category,
            rule.subject ?? null,
            rule.qualifier ?? null,
            memberId,
            "onboarding"
          );
        }
        return { success: true };
      }),
  }),

  // ─── AI Extraction ─────────────────────────────────────────────────────────

  extract: router({
    fromText: publicProcedure
      .input(
        z.object({
          token: z.string(),
          text: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        await requireHousehold(input.token);
        const household = await getHouseholdByToken(input.token);
        const dismissed = await getDismissedInferenceTypes(household!.id);
        const dismissedTypes = dismissed.map((d) => d.inferenceType);
        const result = await extractFromText(input.text, dismissedTypes);
        return result;
      }),

    fromImage: publicProcedure
      .input(
        z.object({
          token: z.string(),
          imageBase64: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);

        const buffer = Buffer.from(input.imageBase64, "base64");
        const tempKey = `temp/${nanoid(16)}.${input.mimeType.split("/")[1] ?? "jpg"}`;
        const { url } = await storagePut(tempKey, buffer, input.mimeType);

        const extractedText = await extractTextFromImageUrl(url);

        const dismissed = await getDismissedInferenceTypes(household.id);
        const dismissedTypes = dismissed.map((d) => d.inferenceType);
        const result = await extractFromText(extractedText, dismissedTypes);
        return result;
      }),

      fromVoice: publicProcedure
      .input(
        z.object({
          token: z.string(),
          audioBase64: z.string(),
          mimeType: z.string().default("audio/webm"),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const buffer = Buffer.from(input.audioBase64, "base64");
        // Send buffer directly to Whisper — avoids the storage URL fetch issue
        const transcript = await transcribeBuffer(buffer, input.mimeType);
        const dismissed = await getDismissedInferenceTypes(household.id);
        const dismissedTypes = dismissed.map((d) => d.inferenceType);
        const result = await extractFromText(transcript, dismissedTypes);
        return { ...result, transcript };
      }),
  }),

  // ─── Routing ───────────────────────────────────────────────────────────────

  routing: router({
    getRules: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        return getRoutingRules(household.id);
      }),

    suggest: publicProcedure
      .input(
        z.object({
          token: z.string(),
          taskTitle: z.string(),
          category: z.string(),
          subject: z.string(),
          qualifier: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const rules = await getRoutingRules(household.id);
        const members = await getMembersByHousehold(household.id);
        const primary = members.find((m) => m.role === "primary");
        const partner = members.find((m) => m.role === "partner");

        const rulesWithAssignee = rules.map((r) => ({
          ...r,
          assignee: r.assigneeMemberId === primary?.id ? "primary" : "partner",
        }));

        const suggestion = await suggestRouting(
          input.taskTitle,
          input.category,
          input.subject,
          input.qualifier,
          primary?.displayName ?? "Primary",
          partner?.displayName ?? "Partner",
          rulesWithAssignee
        );

        const assignedMember = suggestion.assignee === "primary" ? primary : partner;
        return { ...suggestion, memberId: assignedMember?.id };
      }),

    learnRule: publicProcedure
      .input(
        z.object({
          token: z.string(),
          category: z.string(),
          subject: z.string().optional(),
          qualifier: z.string().optional(),
          assigneeMemberId: z.number(),
          permanent: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        if (input.permanent) {
          await createRoutingRule(
            household.id,
            input.category,
            input.subject ?? null,
            input.qualifier ?? null,
            input.assigneeMemberId,
            "learned"
          );
        }
        return { success: true };
      }),

    deleteRule: publicProcedure
      .input(z.object({ token: z.string(), ruleId: z.number() }))
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        // Verify rule belongs to this household
        const rules = await getRoutingRules(household.id);
        const rule = rules.find((r) => r.id === input.ruleId);
        if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
        await deleteRoutingRule(input.ruleId);
        return { success: true };
      }),

    getDismissed: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        return getDismissedInferenceTypes(household.id);
      }),

    dismiss: publicProcedure
      .input(
        z.object({
          token: z.string(),
          inferenceType: z.string(),
          label: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const dismissCount = await dismissInferenceType(household.id, input.inferenceType, input.label);
        return { success: true, dismissCount };
      }),
    restore: publicProcedure
      .input(z.object({ token: z.string(), inferenceType: z.string() }))
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        await restoreInferenceType(household.id, input.inferenceType);
        return { success: true };
      }),

    suggestBatch: publicProcedure
      .input(
        z.object({
          token: z.string(),
          tasks: z.array(
            z.object({
              index: z.number(),
              title: z.string(),
              category: z.string(),
              subject: z.string(),
              qualifier: z.string().optional(),
            })
          ),
        })
      )
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const rules = await getRoutingRules(household.id);
        const members = await getMembersByHousehold(household.id);
        const primary = members.find((m) => m.role === "primary");
        const partner = members.find((m) => m.role === "partner");
        const rulesWithAssignee = rules.map((r) => ({
          ...r,
          assignee: r.assigneeMemberId === primary?.id ? "primary" : "partner",
        }));

        const results: Array<{ index: number; memberId: number | undefined; confidence: string; reasoning: string; assignee: string }> = [];
        for (const t of input.tasks) {
          const suggestion = await suggestRouting(
            t.title, t.category, t.subject, t.qualifier,
            primary?.displayName ?? "Primary",
            partner?.displayName ?? "Partner",
            rulesWithAssignee
          );
          const assignedMember = suggestion.assignee === "primary" ? primary : partner;
          results.push({ index: t.index, memberId: assignedMember?.id, confidence: suggestion.confidence, reasoning: suggestion.reasoning, assignee: suggestion.assignee });
        }
        return results;
      }),
  }),

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  tasks: router({
    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        return getTasksByHousehold(household.id);
      }),

    listMine: publicProcedure
      .input(z.object({ token: z.string(), memberId: z.number() }))
      .query(async ({ input }) => {
        const { household } = await requireMember(input.token, input.memberId);
        return getTasksByMember(household.id, input.memberId);
      }),

    create: publicProcedure
      .input(
        z.object({
          token: z.string(),
          eventId: z.number().optional(),
          title: z.string().min(1),
          description: z.string().optional(),
          category: z.string().default("general"),
          subject: z.string().default("any"),
          qualifier: z.string().optional(),
          ownerMemberId: z.number(),
          deadline: z.string().optional(),
          urgency: z.enum(["low", "medium", "high"]).default("medium"),
          isRecurringSuggestion: z.boolean().default(false),
          isRecurring: z.boolean().default(false),
          lowConfidence: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const task = await createTask({
          householdId: household.id,
          eventId: input.eventId,
          title: input.title,
          description: input.description,
          category: input.category,
          subject: input.subject,
          qualifier: input.qualifier,
          ownerMemberId: input.ownerMemberId,
          deadline: input.deadline ? new Date(input.deadline) : undefined,
          urgency: input.urgency,
          isRecurringSuggestion: input.isRecurringSuggestion,
          isRecurring: input.isRecurring,
          lowConfidence: input.lowConfidence,
        });
        // Push task as all-day calendar reminder to assigned carer if they have a token and there's a deadline
        if (input.deadline && isCalendarConfigured()) {
          try {
            const members = await getMembersByHousehold(household.id);
            const owner = members.find((m) => m.id === input.ownerMemberId);
            if (owner?.googleCalendarToken) {
              const gcalId = await createCalendarEvent(owner.googleCalendarToken, {
                title: `☑️ ${input.title}`,
                description: input.description,
                allDay: true,
                date: new Date(input.deadline),
              });
              if (gcalId) await updateTask(task.id, { googleEventId: gcalId });
            }
          } catch (e) {
            console.warn("[Calendar] Task push failed (non-fatal):", e);
          }
        }
        return task;
      }),

    update: publicProcedure
      .input(
        z.object({
          token: z.string(),
          taskId: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          ownerMemberId: z.number().optional(),
          status: z.enum(["open", "snoozed", "done"]).optional(),
          deadline: z.string().nullable().optional(),
          urgency: z.enum(["low", "medium", "high"]).optional(),
          urgencyOverridden: z.boolean().optional(),
          isRecurring: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const { token, taskId, deadline, ...rest } = input;
        // Verify task belongs to this household
        const allTasks = await getTasksByHousehold(household.id);
        if (!allTasks.find((t) => t.id === taskId)) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await updateTask(taskId, {
          ...rest,
          ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
        });
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ token: z.string(), taskId: z.number() }))
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const allTasks = await getTasksByHousehold(household.id);
        if (!allTasks.find((t) => t.id === input.taskId)) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await deleteTask(input.taskId);
        return { success: true };
      }),
  }),

  // ─── Events ────────────────────────────────────────────────────────────────

  events: router({
    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        return getEventsByHousehold(household.id);
      }),

    create: publicProcedure
      .input(
        z.object({
          token: z.string(),
          title: z.string().min(1),
          description: z.string().optional(),
          location: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          subjectName: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const event = await createEvent(household.id, {
          title: input.title,
          description: input.description,
          location: input.location,
          startTime: input.startTime ? new Date(input.startTime) : undefined,
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          subjectName: input.subjectName,
        });
        // Push event to both carers' calendars if they have tokens
        if (isCalendarConfigured()) {
          try {
            const members = await getMembersByHousehold(household.id);
            const updates: Partial<{ googleEventIdPrimary: string; googleEventIdPartner: string }> = {};
            const primary = members.find((m) => m.role === "primary");
            const partner = members.find((m) => m.role === "partner");
            const calEvent = {
              title: input.title,
              description: input.description,
              allDay: !input.startTime,
              date: input.startTime ? undefined : new Date(),
              startDateTime: input.startTime ? new Date(input.startTime) : null,
              endDateTime: input.endTime ? new Date(input.endTime) : null,
            };
            if (primary?.googleCalendarToken) {
              const id = await createCalendarEvent(primary.googleCalendarToken, calEvent);
              if (id) updates.googleEventIdPrimary = id;
            }
            if (partner?.googleCalendarToken) {
              const id = await createCalendarEvent(partner.googleCalendarToken, calEvent);
              if (id) updates.googleEventIdPartner = id;
            }
            if (Object.keys(updates).length > 0) {
              await updateEventGoogleIds(event.id, updates.googleEventIdPrimary, updates.googleEventIdPartner);
            }
          } catch (e) {
            console.warn("[Calendar] Event push failed (non-fatal):", e);
          }
        }
        return event;
      }),
  }),

  // ─── Load scores ───────────────────────────────────────────────────────────

  load: router({
    scores: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const members = await getMembersByHousehold(household.id);
        const allTasks = await getTasksByHousehold(household.id);

        const scores = members.map((m) => {
          const memberTasks = allTasks.filter((t) => t.ownerMemberId === m.id);
          const openCount = memberTasks.filter((t) => t.status === "open").length;
          const score = computeLoadScore(memberTasks);
          return { member: m, openCount, score };
        });

        const totalScore = scores.reduce((s, m) => s + m.score, 0);
        const threshold = household.imbalanceThreshold ?? 0.6;

        let imbalanced = false;
        if (totalScore > 0 && scores.length === 2) {
          const maxScore = Math.max(...scores.map((s) => s.score));
          imbalanced = maxScore / totalScore >= threshold;
        }

        return { scores, totalScore, imbalanced, threshold };
      }),
  }),

  // ─── Settings ──────────────────────────────────────────────────────────────

  settings: router({
    getRhythm: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await requireHousehold(input.token);
        return getHouseholdRhythm(household.id);
      }),

    updateRhythm: publicProcedure
      .input(
        z.object({
          token: z.string(),
          rawText: z.string().min(1),
          primaryName: z.string(),
          partnerName: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const household = await requireHousehold(input.token);
        const members = await getMembersByHousehold(household.id);
        const primary = members.find((m) => m.role === "primary");
        const partner = members.find((m) => m.role === "partner");
        const structured = await parseHouseholdRhythm(
          input.rawText,
          primary?.displayName ?? input.primaryName,
          partner?.displayName ?? input.partnerName
        );
        await upsertHouseholdRhythm(household.id, input.rawText, structured);
        return { structured };
      }),
  }),

  // ─── Calendar ──────────────────────────────────────────────────────────────

  calendar: router({
    saveToken: publicProcedure
      .input(z.object({ token: z.string(), memberId: z.number(), calendarToken: z.string() }))
      .mutation(async ({ input }) => {
        await requireMember(input.token, input.memberId);
        await updateMemberCalendarToken(input.memberId, input.calendarToken);
        return { success: true };
      }),

    getAuthUrl: publicProcedure
      .input(z.object({ token: z.string(), redirectUri: z.string() }))
      .query(async ({ input }) => {
        await requireHousehold(input.token);
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          return { url: null, configured: false };
        }
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: input.redirectUri,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/calendar.events",
          access_type: "offline",
          prompt: "consent",
        });
        return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, configured: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
