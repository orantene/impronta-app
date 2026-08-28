/**
 * Cron — generate insights for closed tickets that do not have a row yet.
 * Up to 25 tickets, Haiku, 6s timeout, fail-open skip.
 */

import { NextResponse } from "next/server";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { isResolvedAiChatConfigured, resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "@/lib/support/support-from";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 6000;

type InsightParsed = {
  summary?: string;
  root_cause?: string;
  product_area?: string;
  sentiment?: string;
  resolution_kind?: string;
  is_feature_request?: boolean;
  is_bug_report?: boolean;
  tags?: string[];
};

const SCHEMA = {
  name: "support_ticket_insight",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "root_cause",
      "product_area",
      "sentiment",
      "resolution_kind",
      "is_feature_request",
      "is_bug_report",
      "tags",
    ],
    properties: {
      summary: { type: "string" },
      root_cause: { type: "string" },
      product_area: { type: "string" },
      sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
      resolution_kind: {
        type: "string",
        enum: ["ai_self_serve", "human_resolved", "no_response", "unresolved"],
      },
      is_feature_request: { type: "boolean" },
      is_bug_report: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
    },
  },
} as const;

function timeoutNull<T>(ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/support-insights", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_support_enabled) {
    return NextResponse.json({ ok: true, skipped: "flag", generated: 0 });
  }
  if (!(await isResolvedAiChatConfigured())) {
    return NextResponse.json({ ok: true, skipped: "unconfigured", generated: 0 });
  }

  const { data: existing } = await supportFrom(admin, "support_ticket_insights").select("ticket_id");
  const have = new Set((existing ?? []).map((r: { ticket_id?: string }) => String(r.ticket_id)));
  const { data: closed } = await supportFrom(admin, "support_tickets")
    .select("id, tenant_id, subject, category, handled_by, metadata")
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(80);
  const pending = (closed ?? []).filter((t: { id?: string }) => !have.has(String(t.id))).slice(0, 25);

  const adapter = await resolveAiChatAdapter();
  let generated = 0;
  for (const ticket of pending as Array<{
    id: string;
    tenant_id: string | null;
    subject: string;
    category: string | null;
    handled_by: string;
    metadata?: Record<string, unknown> | null;
  }>) {
    const gate = await assertAiInvocationAllowed(ticket.tenant_id ?? DEFAULT_AI_TENANT_ID);
    if (!gate.ok) continue;
    const { data: messages } = await supportFrom(admin, "support_messages")
      .select("author_kind, body")
      .eq("ticket_id", ticket.id)
      .neq("message_kind", "note")
      .order("created_at", { ascending: true })
      .limit(12);
    const thread = (messages ?? [])
      .map((m: { author_kind?: string; body?: string }) => `${m.author_kind}: ${String(m.body ?? "").slice(0, 400)}`)
      .join("\n");
    const completion = await Promise.race([
      adapter.chatCompletion({
        model: MODEL,
        systemPrompt:
          "Summarize this closed support ticket. Use only the thread. No legal or payout claims. Return JSON.",
        userMessage: JSON.stringify({ subject: ticket.subject, category: ticket.category, handledBy: ticket.handled_by, thread }),
        temperature: 0.1,
        maxTokens: 400,
        jsonSchema: {
          name: SCHEMA.name,
          strict: SCHEMA.strict,
          schema: SCHEMA.schema as unknown as Record<string, unknown>,
        },
      }),
      timeoutNull<Awaited<ReturnType<typeof adapter.chatCompletion>>>(TIMEOUT_MS),
    ]);
    if (!completion || !completion.ok) continue;
    let parsed: InsightParsed | null = null;
    try {
      parsed = JSON.parse(completion.text) as InsightParsed;
    } catch {
      continue;
    }
    if (!parsed?.summary) continue;
    const meta =
      ticket.metadata && typeof ticket.metadata === "object" ? ticket.metadata : {};
    const resolutionKind: string =
      meta.ai_self_serve === true
        ? "ai_self_serve"
        : ["ai_self_serve", "human_resolved", "no_response", "unresolved"].includes(
              parsed.resolution_kind ?? "",
            )
          ? (parsed.resolution_kind as string)
          : ticket.handled_by === "ai"
            ? "ai_self_serve"
            : "human_resolved";
    const { error } = await supportFrom(admin, "support_ticket_insights").insert({
      ticket_id: ticket.id,
      tenant_id: ticket.tenant_id,
      summary: parsed.summary.slice(0, 800),
      root_cause: parsed.root_cause?.slice(0, 800) ?? null,
      product_area: parsed.product_area?.slice(0, 80) ?? ticket.category,
      sentiment: ["positive", "neutral", "negative"].includes(parsed.sentiment ?? "") ? parsed.sentiment : "neutral",
      resolution_kind: resolutionKind,
      is_feature_request: parsed.is_feature_request === true,
      is_bug_report: parsed.is_bug_report === true,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
      model: MODEL,
    });
    if (error) {
      logServerError("cron/support-insights.insert", error);
      continue;
    }
    await supportFrom(admin, "support_ticket_events").insert({
      ticket_id: ticket.id,
      tenant_id: ticket.tenant_id,
      actor_kind: "system",
      event_type: "insight_generated",
      new_value: { model: MODEL },
    });
    void recordAiUsageEstimate(ticket.tenant_id ?? DEFAULT_AI_TENANT_ID);
    generated += 1;
  }

  return NextResponse.json({ ok: true, generated, scanned: pending.length });
}
