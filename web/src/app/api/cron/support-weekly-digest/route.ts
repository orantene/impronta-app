/**
 * Cron — Monday 07:00 UTC weekly support digest for platform admins.
 */

import { NextResponse } from "next/server";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { isResolvedAiChatConfigured, resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "@/lib/support/support-from";
import { loadHqInsightsDashboard } from "@/lib/support/insights/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 6000;

function mondayUtc(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

function timeoutNull<T>(ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/support-weekly-digest", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const dash = await loadHqInsightsDashboard();
  const aggregates = {
    openNow: dash.openNow,
    needsYou: dash.needsYou,
    resolvedThisWeek: dash.resolvedThisWeek,
    medianFirstReplyMs: dash.medianFirstReplyMs,
    friction: dash.friction,
    aiResolvedShare: dash.aiResolvedShare,
  };

  let summary = `Resolved ${dash.resolvedThisWeek} tickets this week. ${dash.needsYou} still need a reply.`;
  let suggestedFixes: string[] = dash.friction.slice(0, 3).map((f) => `Review ${f.area} (${f.count} tickets)`);

  const flags = await getAiFeatureFlags();
  if (flags.ai_master_enabled && flags.ai_support_enabled && (await isResolvedAiChatConfigured())) {
    const gate = await assertAiInvocationAllowed(DEFAULT_AI_TENANT_ID);
    if (gate.ok) {
      const adapter = await resolveAiChatAdapter();
      const completion = await Promise.race([
        adapter.chatCompletion({
          model: MODEL,
          systemPrompt:
            "You write a short weekly support digest for Tulala HQ. Ground ONLY in the provided aggregates. No em dashes. Return JSON.",
          userMessage: JSON.stringify(aggregates),
          temperature: 0.2,
          maxTokens: 400,
          jsonSchema: {
            name: "support_weekly_digest",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "suggestedFixes"],
              properties: {
                summary: { type: "string" },
                suggestedFixes: { type: "array", items: { type: "string" } },
              },
            },
          },
        }),
        timeoutNull<Awaited<ReturnType<typeof adapter.chatCompletion>>>(TIMEOUT_MS),
      ]);
      if (completion?.ok) {
        try {
          const parsed = JSON.parse(completion.text) as { summary?: string; suggestedFixes?: string[] };
          if (parsed.summary) summary = parsed.summary.slice(0, 1200);
          if (Array.isArray(parsed.suggestedFixes) && parsed.suggestedFixes.length > 0) {
            suggestedFixes = parsed.suggestedFixes.map((s) => String(s).slice(0, 160)).slice(0, 5);
          }
          void recordAiUsageEstimate(DEFAULT_AI_TENANT_ID);
        } catch {
          /* keep fallback copy */
        }
      }
    }
  }

  const snapshot = {
    weekStart: mondayUtc(new Date()),
    summary,
    suggestedFixes,
    generatedAt: new Date().toISOString(),
  };
  await supportFrom(admin, "platform_settings")
    .update({ support_weekly_digest: snapshot })
    .eq("id", true);
  await supportFrom(admin, "support_weekly_digests").upsert(
    { week_start: snapshot.weekStart, snapshot },
    { onConflict: "week_start" },
  );

  await dispatchEventNotifications({
    type: "support.weekly_digest",
    tenantId: null,
    eventId: `support-weekly-digest-${snapshot.weekStart}`,
    payload: {
      summary,
      suggestedFixes,
      adminPath: "/platform/admin/support?view=insights",
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, snapshot });
}
