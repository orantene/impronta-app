import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import {
  INQUIRY_DRAFT_MAX_CHARS,
  sanitizeInquiryDraftOutput,
} from "@/lib/ai/inquiry-draft-guardrails";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { completeInquiryDraft } from "@/lib/ai/inquiry-draft-model";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

const bodySchema = z.object({
  action: z.enum(["generate", "polish"]),
  locale: z.string().min(2).max(24).optional(),
  talentNames: z.array(z.string().max(200)).max(24),
  rawQuery: z.string().max(4000).optional().nullable(),
  eventLocation: z.string().max(500).optional().nullable(),
  eventDate: z.string().max(80).optional().nullable(),
  quantity: z.string().max(40).optional().nullable(),
  currentMessage: z.string().max(8000).optional().nullable(),
});

/**
 * Phase 13 — LLM-assisted inquiry message drafting. Does not persist; client inserts into the brief field.
 */
export async function POST(request: Request) {
  try {
    const publicSettings = await getPublicSettings();
    if (!publicSettings.directoryPublic) {
      return NextResponse.json(
        { error: "Directory disabled", draft: null },
        { status: 403 },
      );
    }

    const flags = await getAiFeatureFlags();
    if (!flags.ai_master_enabled || !flags.ai_draft_enabled) {
      return NextResponse.json(
        { error: "Inquiry drafting disabled", draft: null },
        { status: 501 },
      );
    }

    if (!(await isResolvedAiChatConfigured())) {
      return NextResponse.json(
        { error: "Drafting unavailable", draft: null },
        { status: 503 },
      );
    }

    const gate = await assertAiInvocationAllowed();
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message, draft: null },
        { status: 429 },
      );
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten(), draft: null },
        { status: 400 },
      );
    }

    const {
      action,
      locale: loc,
      talentNames,
      rawQuery,
      eventLocation,
      eventDate,
      quantity,
      currentMessage,
    } = parsed.data;

    if (action === "polish" && !(currentMessage?.trim())) {
      return NextResponse.json(
        { error: "Nothing to polish", draft: null },
        { status: 400 },
      );
    }

    const draft = await completeInquiryDraft({
      action,
      locale: loc ?? "en",
      talentNames,
      rawQuery: rawQuery ?? "",
      eventLocation: eventLocation ?? "",
      eventDate: eventDate ?? "",
      quantity: quantity ?? "",
      currentMessage: currentMessage ?? "",
    });

    if (!draft) {
      return NextResponse.json(
        { error: CLIENT_ERROR.generic, draft: null },
        { status: 502 },
      );
    }

    const safe = sanitizeInquiryDraftOutput(draft).slice(0, INQUIRY_DRAFT_MAX_CHARS);
    void recordAiUsageEstimate();
    return NextResponse.json({ draft: safe || draft.slice(0, INQUIRY_DRAFT_MAX_CHARS) });
  } catch (e) {
    logServerError("api/ai/inquiry-draft", e);
    return NextResponse.json(
      { error: CLIENT_ERROR.generic, draft: null },
      { status: 500 },
    );
  }
}
