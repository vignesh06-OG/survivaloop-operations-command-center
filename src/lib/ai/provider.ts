/**
 * SurvivaLoop — AI Provider abstraction.
 *
 * This module defines the contract for any AI backend (OpenAI, Anthropic, etc.).
 * The AI assistant operates strictly as an *advisor and drafter*. It can:
 *   - Converse with the field worker about the task at hand.
 *   - Request the worker to upload evidence (photos).
 *   - Generate a structured draft report for review.
 *
 * The AI MUST NEVER:
 *   - Directly mutate task state, approve evidence, or submit proof.
 *   - Bypass server-side authorization or state validation.
 *   - Silently invent missing facts or forge evidence.
 *   - Access internal system prompts, secrets, or other users' data.
 *
 * All AI-generated content is clearly marked as "ai_suggestion" and is never
 * confused with verified system data.
 */

/** A single message in the conversation history. */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  image?: string; // base64 data url or normal url
  /** Timestamp (epoch ms) for audit trail. */
  ts: number;
}

/** Verified task context passed to the provider. Never exposed to the client. */
export interface TaskContext {
  taskId: string;
  entityId: string;
  interventionClassId: string;
  state: string;
  slaState: string;
  slaDeadline: number | null;
  assignedWorkerIds: string[];
  createdAt: number;
  /** Photo refs already submitted (if any proof exists). */
  existingPhotoRefs: string[];
  /** Existing proof notes (if any). */
  existingNotes: string | null;
}

import { z } from "zod";

/**
 * AI response types. Each response has a `kind` discriminator so the frontend
 * can render the appropriate UI widget.
 */
export type AiResponse =
  | AiTextResponse
  | AiRequestUpload
  | AiDraftReport
  | AiTreeHealthResponse
  | AiIntentResponse;

export interface AiTextResponse {
  kind: "text";
  /** The AI's conversational reply. Clearly an AI suggestion, not system data. */
  text: string;
}

export interface AiRequestUpload {
  kind: "request_upload";
  /** Reason the AI is requesting evidence. */
  prompt: string;
}

export interface AiDraftReport {
  kind: "draft_report";
  /** Generated summary for worker review. */
  summary: string;
  /** Structured fields for the proof payload. Worker must review before submit. */
  draft: {
    note: string;
    photoRefs: string[];
    location: { lat: number; lng: number } | null;
  };
}

export interface AiTreeHealthResponse {
  kind: "tree_health";
  healthScore: number;
  status: "HEALTHY" | "STRESSED" | "CRITICAL" | "DEAD";
  issues: string[];
  recommendations: string[];
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  speciesGuess: string;
}

export interface AiIntentResponse {
  kind: "intent";
  intent: "COMPLAINT" | "TREE_HEALTH" | "NAVIGATION" | "TASK_QUERY" | "GENERAL";
  replyText: string;
  extractedComplaint?: {
    category: string;
    description: string;
    location: string;
    urgency: string;
  } | null;
}

// --- Zod Schemas for Validation ---

export const aiTextResponseSchema = z.object({
  kind: z.literal("text"),
  text: z.string(),
});

export const aiRequestUploadSchema = z.object({
  kind: z.literal("request_upload"),
  prompt: z.string(),
});

export const aiDraftReportSchema = z.object({
  kind: z.literal("draft_report"),
  summary: z.string(),
  draft: z.object({
    note: z.string(),
    photoRefs: z.array(z.string()),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  }),
});

export const aiTreeHealthSchema = z.object({
  kind: z.literal("tree_health"),
  healthScore: z.number(),
  status: z.enum(["HEALTHY", "STRESSED", "CRITICAL", "DEAD"]),
  issues: z.array(z.string()),
  recommendations: z.array(z.string()),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  speciesGuess: z.string(),
});

export const aiIntentSchema = z.object({
  kind: z.literal("intent"),
  intent: z.enum(["COMPLAINT", "TREE_HEALTH", "NAVIGATION", "TASK_QUERY", "GENERAL"]),
  replyText: z.string(),
  extractedComplaint: z.object({
    category: z.string(),
    description: z.string(),
    location: z.string(),
    urgency: z.string(),
  }).nullable().optional(),
});

export const aiResponseSchema = z.discriminatedUnion("kind", [
  aiTextResponseSchema,
  aiRequestUploadSchema,
  aiDraftReportSchema,
  aiTreeHealthSchema,
  aiIntentSchema,
]);

/**
 * Validates any raw data from an AI provider against the expected schema.
 * Throws if the response does not match the contract.
 */
export function parseAiResponse(data: unknown): AiResponse {
  return aiResponseSchema.parse(data);
}

/**
 * The provider interface. Implementations handle a single conversation turn
 * and return one of the structured response types.
 */
export interface AiProvider {
  /**
   * Process one conversation turn.
   *
   * @param history  - Full conversation history (client-visible messages only).
   * @param context  - Verified task context from the server. NEVER sent to client.
   * @param locale   - ISO language code for response localization.
   * @returns A structured response the UI can render.
   */
  chat(
    history: ChatMessage[],
    context: TaskContext | null,
    locale: string,
  ): Promise<AiResponse>;
}
