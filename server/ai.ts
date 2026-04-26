import { invokeLLM, type Message } from "./_core/llm";
import { transcribeAudio, type WhisperResponse } from "./_core/voiceTranscription";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedEvent {
  title: string;
  description?: string;
  location?: string;
  startTime?: string; // ISO string
  endTime?: string;
  subjectName?: string; // e.g. "Mia", "Julian"
}

export interface ExtractedTask {
  title: string;
  description?: string;
  category: string;
  subject: string; // kids, self, partner, pet, any
  qualifier?: string;
  deadline?: string; // ISO string
  urgency: "low" | "medium" | "high";
  isRecurringSuggestion: boolean;
  lowConfidence: boolean;
  inferenceType?: string; // e.g. "buy_present", "pack_swimmers"
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  tasks: ExtractedTask[];
  birthdayPresents?: string[]; // exactly 3 if birthday detected
  recurrencePrompt?: string; // human-readable suggestion
}

export interface StructuredRhythm {
  entries: Array<{
    person: string; // "primary" | "partner" | name
    activity: string;
    dayOfWeek: string;
    time?: string;
    notes?: string;
  }>;
  routingHints: Array<{
    category: string;
    subject: string;
    qualifier?: string;
    person: string;
  }>;
}

export interface ParsedRoutingRules {
  rules: Array<{
    category: string;
    subject?: string;
    qualifier?: string;
    assignee: "primary" | "partner";
  }>;
}

// ─── Main extraction pipeline ─────────────────────────────────────────────────

export async function extractFromText(
  text: string,
  dismissedInferenceTypes: string[] = [],
  householdContext?: string
): Promise<ExtractionResult> {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const tasks: ExtractedTask[] = parts.map((title) => ({
    title,
    category: "general",
    subject: "any",
    urgency: "medium",
    isRecurringSuggestion: false,
    lowConfidence: false,
  }));

  return {
    events: [],
    tasks,
  };
}

// ─── Extract text from image via LLM vision ───────────────────────────────────

export async function extractTextFromImageUrl(imageUrl: string): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a document reader. Extract ALL text from the provided image as accurately as possible. Return only the raw text, no commentary.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
          { type: "text", text: "Extract all text from this image." },
        ],
      } as Message,
    ],
  });

  const raw = response.choices[0]?.message?.content;
  return typeof raw === "string" ? raw : JSON.stringify(raw) ?? "";
}

// ─── Transcribe voice note ────────────────────────────────────────────────────

export async function transcribeVoiceNote(audioUrl: string): Promise<string> {
  const result = await transcribeAudio({
    audioUrl,
    language: "en",
    prompt: "Family household tasks, events, school notices, medical appointments",
  });
  if ("error" in result) throw new Error(result.error);
  return (result as WhisperResponse).text;
}

// ─── Parse household rhythm ───────────────────────────────────────────────────

export async function parseHouseholdRhythm(
  rawText: string,
  primaryName: string,
  partnerName: string
): Promise<StructuredRhythm> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You parse household weekly schedules into structured data.
Primary carer name: "${primaryName}", Partner carer name: "${partnerName}".
Map names to "primary" or "partner" in the output.
Return valid JSON only.`,
      },
      {
        role: "user",
        content: `Parse this household rhythm:\n\n${rawText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "structured_rhythm",
        strict: true,
        schema: {
          type: "object",
          properties: {
            entries: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  person: { type: "string" },
                  activity: { type: "string" },
                  dayOfWeek: { type: "string" },
                  time: { type: "string" },
                  notes: { type: "string" },
                },
                required: ["person", "activity", "dayOfWeek"],
                additionalProperties: false,
              },
            },
            routingHints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  subject: { type: "string" },
                  qualifier: { type: "string" },
                  person: { type: "string" },
                },
                required: ["category", "subject", "person"],
                additionalProperties: false,
              },
            },
          },
          required: ["entries", "routingHints"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent2 = response.choices[0]?.message?.content;
  const content2 = typeof rawContent2 === "string" ? rawContent2 : JSON.stringify(rawContent2);
  if (!content2) throw new Error("No response from AI");
  return JSON.parse(content2) as StructuredRhythm;
}

// ─── Parse domain assignment exceptions ──────────────────────────────────────

export async function parseRoutingExceptions(
  exceptionsText: string,
  primaryName: string,
  partnerName: string
): Promise<ParsedRoutingRules> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You parse household task routing exceptions into structured rules.
Primary carer: "${primaryName}", Partner: "${partnerName}".
Map names to "primary" or "partner".
Return valid JSON only.`,
      },
      {
        role: "user",
        content: `Parse these routing exceptions:\n\n${exceptionsText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "parsed_routing_rules",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rules: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  subject: { type: "string" },
                  qualifier: { type: "string" },
                  assignee: { type: "string", enum: ["primary", "partner"] },
                },
                required: ["category", "assignee"],
                additionalProperties: false,
              },
            },
          },
          required: ["rules"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content) as ParsedRoutingRules;
}

// ─── Contextual routing decision ─────────────────────────────────────────────

export async function suggestRouting(
  taskTitle: string,
  category: string,
  subject: string,
  qualifier: string | undefined,
  primaryName: string,
  partnerName: string,
  existingRules: Array<{ category: string; subject?: string | null; qualifier?: string | null; assignee: string }>
): Promise<{ assignee: "primary" | "partner"; confidence: string; reasoning: string }> {
  const rulesText = existingRules
    .map((r) => `${r.category}/${r.subject ?? "any"}/${r.qualifier ?? "any"} → ${r.assignee}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You suggest which household carer should own a task.
Primary carer: "${primaryName}", Partner: "${partnerName}".
Existing routing rules:\n${rulesText}\n
Return valid JSON only.`,
      },
      {
        role: "user",
        content: `Task: "${taskTitle}", category: ${category}, subject: ${subject}, qualifier: ${qualifier ?? "none"}. Who should handle this?`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "routing_suggestion",
        strict: true,
        schema: {
          type: "object",
          properties: {
            assignee: { type: "string", enum: ["primary", "partner"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reasoning: { type: "string" },
          },
          required: ["assignee", "confidence", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  if (!content) return { assignee: "primary", confidence: "low", reasoning: "No rules found" };
  return JSON.parse(content) as { assignee: "primary" | "partner"; confidence: string; reasoning: string };
}
