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
  | AiDraftReport;

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

export const aiResponseSchema = z.discriminatedUnion("kind", [
  aiTextResponseSchema,
  aiRequestUploadSchema,
  aiDraftReportSchema,
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
    context: TaskContext,
    locale: string,
  ): Promise<AiResponse>;
}
