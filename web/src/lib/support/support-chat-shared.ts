import type { SupportEscalationReason } from "./support-types";

export const SUPPORT_CHAT_SCHEMA = {
  name: "support_first_responder",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "answer",
      "confidence",
      "suggested_subject",
      "category",
      "tags",
      "sentiment",
      "escalate",
      "escalate_reason",
    ],
    properties: {
      answer: { type: "string" },
      confidence: { type: "number" },
      suggested_subject: { type: "string" },
      category: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
      escalate: { type: "boolean" },
      escalate_reason: {
        type: "string",
        enum: [
          "",
          "user_requested",
          "ai_low_confidence",
          "ai_sentiment",
          "ai_suggested",
          "ai_unavailable",
        ],
      },
    },
  },
} as const;

export const SUPPORT_CHAT_REASONS = new Set<SupportEscalationReason>([
  "ai_low_confidence",
  "ai_sentiment",
  "ai_suggested",
  "ai_unavailable",
]);

export const SUPPORT_CHAT_FAIL_OPEN_BODY =
  "I'm having trouble right now. Want me to get Oran?";

export type SupportChatModelOut = {
  answer: string;
  confidence: number;
  suggested_subject: string;
  category: string;
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
  escalate: boolean;
  escalate_reason: string;
};

export function parseSupportChatModel(text: string): SupportChatModelOut | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const sentiment = raw.sentiment;
    if (sentiment !== "positive" && sentiment !== "neutral" && sentiment !== "negative") {
      return null;
    }
    return {
      answer: typeof raw.answer === "string" ? raw.answer : "",
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
      suggested_subject: typeof raw.suggested_subject === "string" ? raw.suggested_subject : "",
      category: typeof raw.category === "string" ? raw.category : "",
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
      sentiment,
      escalate: raw.escalate === true,
      escalate_reason: typeof raw.escalate_reason === "string" ? raw.escalate_reason : "",
    };
  } catch {
    return null;
  }
}
