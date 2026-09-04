import { SUPPORT_AGENT } from "@/lib/support/support-persona";
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
  `I'm having trouble right now. Want me to get ${SUPPORT_AGENT.name}?`;

/**
 * Fail-open copy for the GUEST (marketing) surface.
 *
 * Deliberately different from the signed-in string above. A customer already
 * inside the product can be told a subsystem is misbehaving; a prospect on
 * tulala.digital cannot. The shared string reads as "the thing you are
 * evaluating is broken", and it is what a real visitor got in production after
 * asking whether Tulala has AI support (ticket #11) — the worst possible answer
 * to that question, on the page whose job is to sell.
 *
 * So this one never mentions a fault. It states what is true and always true
 * (Oran answers these himself) and moves straight to the thing we want anyway:
 * the email. Same escalation path underneath, same ai_unavailable reason.
 */
/**
 * NOTE ON THE PROMISE THAT USED TO BE HERE. This string ended "usually the same
 * day". We cannot keep that — support is one part-time responder, and the
 * /support page states in its own words that we will not publish a response
 * time we cannot commit to, because a missed promise is worse than no promise.
 * The fail-open copy was quietly making exactly that promise, to the visitor
 * least equipped to check it. It now says what is true and nothing more.
 */
export const SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY =
  `${SUPPORT_AGENT.name} answers these himself. Leave your email and he will reply there.`;

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
