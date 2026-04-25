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
  getMemberByUserId,
  getMembersByHousehold,
  getRoutingRules,
  getTasksByHousehold,
  getTasksByMember,
  restoreInferenceType,
  updateHouseholdThreshold,
  updateMemberCalendarToken,
  updateTask,
  upsertHouseholdRhythm,
  upsertUser,
} from "./db";
import {
  extractFromText,
  extractTextFromImageUrl,
  parseHouseholdRhythm,
  parseRoutingExceptions,
  suggestRouting,
  transcribeVoiceNote,
} from "./ai";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireMembership(userId: number, householdId: number) {
  const member = await getMemberByUserId(userId, householdId);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this household" });
  return member;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Household ─────────────────────────────────────────────────────────────

  household: router({
    // Create a new household during onboarding
    create: protectedProcedure
      .input(
        z.object({
          primaryName: z.string().min(1),
          partnerName: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const shareToken = nanoid(32);
        const household = await createHousehold(
          `${input.primaryName} & ${input.partnerName}'s Household`,
          shareToken
        );
        if (!household) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Create primary member for the logged-in user
        const primaryMember = await createHouseholdMember(
          household.id,
          ctx.user.id,
          input.primaryName,
          "primary"
        );

        return { household, primaryMember };
      }),

    // Get household by share token (for the shared link)
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const household = await getHouseholdByToken(input.token);
        if (!household) throw new TRPCError({ code: "NOT_FOUND" });
        const members = await getMembersByHousehold(household.id);
        return { household, members };
      }),

    // Get household info for authenticated user
    getMine: protectedProcedure.query(async ({ ctx }) => {
      // Find household where user is a member
      const db = await import("./db").then((m) => m.getDb());
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { householdMembers } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const memberRows = await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.userId, ctx.user.id))
        .limit(1);
      if (!memberRows[0]) return null;
      const household = await getHouseholdById(memberRows[0].householdId);
      if (!household) return null;
      const members = await getMembersByHousehold(household.id);
      return { household, members, myMemberId: memberRows[0].id };
    }),

    updateThreshold: protectedProcedure
      .input(z.object({ householdId: z.number(), threshold: z.number().min(0.5).max(1) }))
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        await updateHouseholdThreshold(input.householdId, input.threshold);
        return { success: true };
      }),
  }),

  // ─── Onboarding ────────────────────────────────────────────────────────────

  onboarding: router({
    // Save household rhythm
    saveRhythm: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          rawText: z.string().min(1),
          primaryName: z.string(),
          partnerName: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const structured = await parseHouseholdRhythm(input.rawText, input.primaryName, input.partnerName);
        await upsertHouseholdRhythm(input.householdId, input.rawText, structured);
        return { structured };
      }),

    // Save domain assignment rules from onboarding toggle list
    saveDomainAssignment: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
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
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        for (const a of input.assignments) {
          if (a.assignee === "ask") continue;
          const memberId = a.assignee === "primary" ? input.primaryMemberId : input.partnerMemberId;
          await createRoutingRule(input.householdId, a.category, null, null, memberId, "onboarding");
        }
        return { success: true };
      }),

    // Parse and save routing exceptions (free-text nuance)
    saveExceptions: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          exceptionsText: z.string(),
          primaryName: z.string(),
          partnerName: z.string(),
          primaryMemberId: z.number(),
          partnerMemberId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const parsed = await parseRoutingExceptions(
          input.exceptionsText,
          input.primaryName,
          input.partnerName
        );
        for (const rule of parsed.rules) {
          const memberId = rule.assignee === "primary" ? input.primaryMemberId : input.partnerMemberId;
          await createRoutingRule(
            input.householdId,
            rule.category,
            rule.subject ?? null,
            rule.qualifier ?? null,
            memberId,
            "onboarding"
          );
        }
        return { success: true };
      }),

    // Register partner (called when partner opens the shared link and logs in)
    registerPartner: protectedProcedure
      .input(z.object({ householdId: z.number(), displayName: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getMemberByUserId(ctx.user.id, input.householdId);
        if (existing) return { member: existing };
        const member = await createHouseholdMember(
          input.householdId,
          ctx.user.id,
          input.displayName,
          "partner"
        );
        return { member };
      }),
  }),

  // ─── AI Extraction ─────────────────────────────────────────────────────────

  extract: router({
    // Process text input
    fromText: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          text: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const dismissed = await getDismissedInferenceTypes(input.householdId);
        const dismissedTypes = dismissed.map((d) => d.inferenceType);
        const result = await extractFromText(input.text, dismissedTypes);
        return result;
      }),

    // Process image: upload to storage, extract text via LLM vision, discard original
    fromImage: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          imageBase64: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);

        // Upload temporarily to get a URL for LLM vision
        const buffer = Buffer.from(input.imageBase64, "base64");
        const tempKey = `temp/${nanoid(16)}.${input.mimeType.split("/")[1] ?? "jpg"}`;
        const { url } = await storagePut(tempKey, buffer, input.mimeType);

        // Extract text via LLM vision
        const extractedText = await extractTextFromImageUrl(url);

        // Do NOT store the image — only the extracted text is used
        const dismissed = await getDismissedInferenceTypes(input.householdId);
        const dismissedTypes = dismissed.map((d) => d.inferenceType);
        const result = await extractFromText(extractedText, dismissedTypes);
        return result;
      }),

    // Process voice note: transcribe via Whisper, then extract
    fromVoice: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          audioBase64: z.string(),
          mimeType: z.string().default("audio/webm"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);

        // Upload audio temporarily for Whisper transcription
        const buffer = Buffer.from(input.audioBase64, "base64");
        const ext = input.mimeType.split("/")[1] ?? "webm";
        const tempKey = `temp/voice-${nanoid(16)}.${ext}`;
        const { url } = await storagePut(tempKey, buffer, input.mimeType);

        // Transcribe via Whisper
        const transcript = await transcribeVoiceNote(url);

        // Extract from transcript
        const dismissed = await getDismissedInferenceTypes(input.householdId);
        const dismissedTypes = dismissed.map((d) => d.inferenceType);
        const result = await extractFromText(transcript, dismissedTypes);
        return { ...result, transcript };
      }),
  }),

  // ─── Routing ───────────────────────────────────────────────────────────────

  routing: router({
    getRules: protectedProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        return getRoutingRules(input.householdId);
      }),

    suggest: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          taskTitle: z.string(),
          category: z.string(),
          subject: z.string(),
          qualifier: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const rules = await getRoutingRules(input.householdId);
        const members = await getMembersByHousehold(input.householdId);
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

    // Learn a new rule from user confirmation
    learnRule: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          category: z.string(),
          subject: z.string().optional(),
          qualifier: z.string().optional(),
          assigneeMemberId: z.number(),
          permanent: z.boolean().default(true),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        if (input.permanent) {
          await createRoutingRule(
            input.householdId,
            input.category,
            input.subject ?? null,
            input.qualifier ?? null,
            input.assigneeMemberId,
            "learned"
          );
        }
        return { success: true };
      }),

    deleteRule: protectedProcedure
      .input(z.object({ ruleId: z.number(), householdId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        await deleteRoutingRule(input.ruleId);
        return { success: true };
      }),

    getDismissed: protectedProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        return getDismissedInferenceTypes(input.householdId);
      }),

    dismiss: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          inferenceType: z.string(),
          label: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        await dismissInferenceType(input.householdId, input.inferenceType, input.label);
        return { success: true };
      }),

    restore: protectedProcedure
      .input(z.object({ householdId: z.number(), inferenceType: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        await restoreInferenceType(input.householdId, input.inferenceType);
        return { success: true };
      }),

    // Batch routing suggestions for the task processing modal
    suggestBatch: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
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
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const rules = await getRoutingRules(input.householdId);
        const members = await getMembersByHousehold(input.householdId);
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
    list: protectedProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        return getTasksByHousehold(input.householdId);
      }),

    listMine: protectedProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input, ctx }) => {
        const member = await requireMembership(ctx.user.id, input.householdId);
        return getTasksByMember(input.householdId, member.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          eventId: z.number().optional(),
          title: z.string().min(1),
          description: z.string().optional(),
          category: z.string().default("general"),
          subject: z.string().default("any"),
          qualifier: z.string().optional(),
          ownerMemberId: z.number(),
          deadline: z.string().optional(), // ISO string
          urgency: z.enum(["low", "medium", "high"]).default("medium"),
          isRecurringSuggestion: z.boolean().default(false),
          isRecurring: z.boolean().default(false),
          lowConfidence: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const task = await createTask({
          householdId: input.householdId,
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
        return task;
      }),

    update: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          householdId: z.number(),
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
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const { taskId, householdId, deadline, ...rest } = input;
        await updateTask(taskId, {
          ...rest,
          ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ taskId: z.number(), householdId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        await deleteTask(input.taskId);
        return { success: true };
      }),
  }),

  // ─── Events ────────────────────────────────────────────────────────────────

  events: router({
    list: protectedProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        return getEventsByHousehold(input.householdId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          location: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          subjectName: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const event = await createEvent(input.householdId, {
          title: input.title,
          description: input.description,
          location: input.location,
          startTime: input.startTime ? new Date(input.startTime) : undefined,
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          subjectName: input.subjectName,
        });
        return event;
      }),
  }),

  // ─── Load scores ───────────────────────────────────────────────────────────

  load: router({
    scores: protectedProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        const members = await getMembersByHousehold(input.householdId);
        const allTasks = await getTasksByHousehold(input.householdId);
        const household = await getHouseholdById(input.householdId);

        const scores = members.map((m) => {
          const memberTasks = allTasks.filter((t) => t.ownerMemberId === m.id);
          const openCount = memberTasks.filter((t) => t.status === "open").length;
          const score = computeLoadScore(memberTasks);
          return { member: m, openCount, score };
        });

        const totalScore = scores.reduce((s, m) => s + m.score, 0);
        const threshold = household?.imbalanceThreshold ?? 0.6;

        let imbalanced = false;
        if (totalScore > 0 && scores.length === 2) {
          const maxScore = Math.max(...scores.map((s) => s.score));
          imbalanced = maxScore / totalScore >= threshold;
        }

        return { scores, totalScore, imbalanced, threshold };
      }),
  }),

  // ─── Calendar ──────────────────────────────────────────────────────────────

  calendar: router({
    saveToken: protectedProcedure
      .input(z.object({ householdId: z.number(), token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const member = await requireMembership(ctx.user.id, input.householdId);
        await updateMemberCalendarToken(member.id, input.token);
        return { success: true };
      }),

    getAuthUrl: protectedProcedure
      .input(z.object({ householdId: z.number(), redirectUri: z.string() }))
      .query(async ({ input, ctx }) => {
        await requireMembership(ctx.user.id, input.householdId);
        // Return the Google OAuth URL — client ID must be configured via secrets
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
