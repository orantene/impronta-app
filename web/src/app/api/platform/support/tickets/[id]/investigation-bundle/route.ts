import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/server/action-guards";
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

async function authorized(request: Request): Promise<boolean> {
  const token = process.env.SUPPORT_INVESTIGATION_TOKEN?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token && bearer && tokenMatches(token, bearer)) return true;
  const admin = await requireAdmin();
  return admin.ok;
}

export async function GET(request: Request, ctx: Ctx) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const detail = await loadHqTicketDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
