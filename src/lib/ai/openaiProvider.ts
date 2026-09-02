import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AiProvider, ChatMessage, TaskContext, AiResponse } from "./provider";
import { aiResponseSchema } from "./provider";

export class OpenAiProvider implements AiProvider {
  private client: OpenAI | null = null;

  constructor() {
    // The client reads OPENAI_API_KEY from process.env automatically.
    try {
      this.client = new OpenAI();
    } catch (e) {
      console.warn("[OpenAiProvider] Failed to initialize (missing OPENAI_API_KEY?)");
    }
  }

  async chat(
    history: ChatMessage[],
    context: TaskContext | null,
    locale: string
  ): Promise<AiResponse> {
    if (!this.client) {
      throw new Error("OpenAI client not initialized (missing API key)");
    }

    // LAYER 1: Deterministic routing for greetings
    const lastUserMsg = [...history].reverse().find(m => m.role === "user");
    if (lastUserMsg && !lastUserMsg.image) {
      const text = lastUserMsg.content.toLowerCase().trim();
      const greetings = ["hi", "hello", "hey", "help"];
      if (greetings.includes(text)) {
        let greeting = "Hello! I am your AI Field Assistant. I can help you summarize tasks, draft reports, or understand the platform. How can I assist you today?";
        if (locale.startsWith("hi")) greeting = "नमस्ते! मैं आपका एआई फील्ड असिस्टेंट हूं। मैं आपके कार्यों को सारांशित करने, रिपोर्ट तैयार करने या प्लेटफ़ॉर्म को समझने में आपकी मदद कर सकता हूं। मैं आपकी कैसे मदद कर सकता हूं?";
        if (locale.startsWith("mr")) greeting = "नमस्कार! मी तुमचा एआय फील्ड असिस्टंट आहे. मी तुम्हाला तुमची कामे समजून घेण्यासाठी किंवा अहवाल तयार करण्यासाठी मदत करू शकतो.";
        if (locale.startsWith("ur")) greeting = "ہیلو! میں آپ کا اے آئی فیلڈ اسسٹنٹ ہوں۔ میں آپ کی کیسے مدد کر سکتا ہوں؟";
        
        return {
          kind: "text",
          text: greeting,
        };
      }
    }

    const systemPrompt = this.buildSystemPrompt(context, locale);

    // Map history to OpenAI format.
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => {
        if (msg.image) {
          return {
            role: msg.role as "user",
            content: [
              { type: "text" as const, text: msg.content },
              { type: "image_url" as const, image_url: { url: msg.image } }
            ]
          };
        }
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content,
        };
      }),
    ];

    // Check if we need to include vision data from context.
    if (context && context.existingPhotoRefs.length > 0 && messages.length > 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "user") {
        const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = Array.isArray(lastMsg.content) 
          ? [...lastMsg.content] 
          : [{ type: "text" as const, text: String(lastMsg.content) }];
        
        for (const ref of context.existingPhotoRefs) {
          if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("data:")) {
            contentParts.push({
              type: "image_url" as const,
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

  private buildSystemPrompt(context: TaskContext | null, locale: string): string {
    let prompt = `You are an AI Field Assistant for the SurvivaLoop Operations platform.
You act as an advisor and helper for field workers and supervisors, including those who are not tech-savvy.

## Global Rules
1. Respond exclusively in the requested language locale: ${locale}.
2. If the user asks for general navigation (e.g., "Where are my tasks?"), return kind="intent" with intent="NAVIGATION".
3. If the user wants to register a complaint (e.g., water issue, tree dying), return kind="intent" with intent="COMPLAINT". Extract any relevant info.
4. If the user uploads an image of a tree and asks for analysis, return kind="tree_health" with a detailed analysis.
5. If the user asks how to use the app, use the App Help Knowledge below to answer accurately. Return kind="text".
6. For all other general inquiries, return kind="intent" with intent="GENERAL" or kind="text" for simple text.

## App Help Knowledge (Platform Features)
- Dashboard/Map: The Command Center (for Supervisors and Admins) displays a 2D/3D map of all clusters and interventions.
- Priority Queue: Shows incoming AI decisions that need human verification or override.
- Seed Button: Generates simulated tasks and evidence for demo purposes.
- Override: Supervisors can override AI decisions (e.g., change ACT to DEFER).
- Field Worker Tasks: Field workers see a list of assigned tasks, where they must travel to the location, capture photo evidence, and submit proof.
- Roles: ADMIN (full access, config), SUPERVISOR (dashboard, act, dispatch, review proofs), FIELD WORKER (mobile app, tasks, proofs), AUDITOR (read-only compliance dashboard).`;

    if (context) {
      prompt += `\n
## Task Context (VERIFIED SYSTEM DATA)
- Task ID: ${context.taskId}
- Entity ID: ${context.entityId}
- Current State: ${context.state}
- Photos Uploaded: ${context.existingPhotoRefs.length}

## Task Rules
- If you have enough info AND at least 1 photo is uploaded, generate a draft report. Return a "draft_report" response.
- In the draft report's note field, ALWAYS prefix your text exactly with "[AI Draft]".
- Never approve or finalize the task yourself.`;
    }

    return prompt;
  }
}
