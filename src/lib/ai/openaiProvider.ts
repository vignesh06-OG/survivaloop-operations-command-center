import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AiProvider, ChatMessage, TaskContext, AiResponse } from "./provider";
import { aiResponseSchema } from "./provider";

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;

  constructor() {
    // The client reads OPENAI_API_KEY from process.env automatically.
    this.client = new OpenAI();
  }

  async chat(
    history: ChatMessage[],
    context: TaskContext,
    locale: string
  ): Promise<AiResponse> {
    const systemPrompt = this.buildSystemPrompt(context, locale);

    // Map history to OpenAI format.
    // If vision is required, we should map existingPhotoRefs into the final user message.
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    // Check if we need to include vision data.
    // If context has existingPhotoRefs, and the user's latest message exists,
    // we attach the photos to the last user message so the AI can analyze them.
    if (context.existingPhotoRefs.length > 0 && messages.length > 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "user") {
        // Build image content array
        const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
          { type: "text", text: String(lastMsg.content) },
        ];
        
        // For production, we'd fetch the real images from IPFS or a signed URL.
        // For this implementation blueprint, we pass the URLs if they are HTTP, 
        // or a mock if it's IPFS (since OpenAI requires http(s) or base64).
        for (const ref of context.existingPhotoRefs) {
          if (ref.startsWith("http://") || ref.startsWith("https://")) {
            contentParts.push({
              type: "image_url",
              image_url: { url: ref, detail: "low" },
            });
          }
        }
        
        lastMsg.content = contentParts;
      }
    }

    const completion = await this.client.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages,
      response_format: zodResponseFormat(aiResponseSchema, "ai_response"),
      temperature: 0.2, // keep it focused and deterministic
    });

    const result = completion.choices[0]?.message.parsed;
    
    if (!result) {
      throw new Error("OpenAI returned an empty or unparseable response");
    }

    return result as AiResponse;
  }

  private buildSystemPrompt(context: TaskContext, locale: string): string {
    return `You are an AI Field Assistant for the SurvivaLoop Operations platform.
You are helping a field worker execute a task. You act as an advisor and drafter.

## Task Context (VERIFIED SYSTEM DATA)
- Task ID: ${context.taskId}
- Entity ID: ${context.entityId}
- Intervention Class: ${context.interventionClassId}
- Current State: ${context.state}
- SLA State: ${context.slaState}
- Photos Uploaded: ${context.existingPhotoRefs.length}

## Rules
1. DO NOT invent facts. Only use information provided by the worker in the chat or the verified task context.
2. If you need more information about the situation, ask a brief follow-up question. Return a "text" response.
3. If you understand the situation but need visual evidence (and 0 photos are uploaded), request a photo. Return a "request_upload" response.
4. If you have enough information AND at least 1 photo is uploaded, generate a draft report. Return a "draft_report" response.
5. In the draft report's \`note\` field, ALWAYS prefix your text exactly with "[AI Draft]".
6. Never approve or finalize the task yourself. You are only preparing a draft.
7. Reply exclusively in the requested language locale: ${locale}.`;
  }
}
