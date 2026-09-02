import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { auditHq } from "@/lib/support/support-engine-emit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { supportFrom } from "@/lib/support/support-from";
import { loadHqTicketDetail } from "@/lib/support/load-hq";
import { redactPii, renderInvestigationMarkdown } from "@/lib/support/investigation/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function tokenMatches(token: string, bearer: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(bearer, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Returns WHO authorized, not just whether. This export hands over a customer's
 * whole ticket, their diagnostics and their thread, and it was previously
 * unaudited in both branches — the boolean discarded the one piece of
 * information an audit row needs.
 *
 * The shared-token branch remains structurally unattributable: the token is a
 * machine credential with no user behind it, so it can be logged but never
 * attributed. It is recorded as such rather than quietly treated the same as a
 * named admin.
 */
type Authorization =
  | { ok: false }
  | { ok: true; via: "admin"; actorUserId: string }
  | { ok: true; via: "shared_token"; actorUserId: null };

async function authorized(request: Request): Promise<Authorization> {
  const token = process.env.SUPPORT_INVESTIGATION_TOKEN?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token && bearer && tokenMatches(token, bearer)) {
    return { ok: true, via: "shared_token", actorUserId: null };
  }
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false };
  return { ok: true, via: "admin", actorUserId: admin.user.id };
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await authorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const detail = await loadHqTicketDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Audit the export. A named admin gets a real platform_audit_log row; the
  // shared-token path has no actor to attribute, so it is logged to the server
  // channel instead of silently passing. Both were previously invisible.
  if (auth.via === "admin") {
    await auditHq(auth.actorUserId, id, "support.investigation_bundle.exported", {
      via: "admin",
      surface: detail.ticket.surface,
      tenantId: detail.ticket.tenantId,
    });
  } else {
    logServerError(
      "support.investigation_bundle.exported",
      `shared-token export of ticket ${id} (no attributable actor)`,
    );
  }

  const admin = createServiceRoleClient();
  let diagnostics: Record<string, unknown> | null = null;
  if (admin) {
    const { data } = await supportFrom(admin, "support_ticket_diagnostics")
      .select("*")
      .eq("ticket_id", id)
      .maybeSingle();
    if (data && typeof data === "object") diagnostics = data as Record<string, unknown>;
  }

  const md = renderInvestigationMarkdown({
    ticket: detail.ticket,
    messages: detail.messages,
    tenantSlug: detail.context.tenantSlug,
    diagnostics,
    auditEvents: detail.context.auditEvents,
  });

  const format = new URL(request.url).searchParams.get("format");
  if (format === "json") {
    return NextResponse.json({
      markdown: md,
      ticket: redactPii(detail.ticket),
      diagnostics: redactPii(diagnostics),
    });
  }

  return new NextResponse(md, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="INV-${detail.ticket.ticketNumber}.md"`,
    },
  });
}
