"use client";

import type { InspectorContext } from "@/lib/admin/admin-inspector/types";

function hasSpecificInspector(ctx: InspectorContext) {
  const p = ctx.pathname;
  if (p.startsWith("/admin/bookings")) return true;
  if (p.startsWith("/admin/inquiries")) return true;
  if (p.startsWith("/admin/talent")) return true;
  if (p.includes("/site-settings/content/")) return true;
  if (p.startsWith("/admin/ai-workspace")) return true;
  if (p.startsWith("/admin/analytics/search")) return true;
  return false;
}

export function DefaultInspectorModule({ ctx }: { ctx: InspectorContext }) {
  if (!ctx.pathname.startsWith("/admin")) return null;
  if (hasSpecificInspector(ctx)) return null;

  return (
    <p className="text-xs leading-relaxed text-[var(--admin-nav-idle)]">
      This panel surfaces contextual tools on bookings, inquiries, talent, CMS editors, and AI / search routes. Open a
      page in those areas for filters, summaries, and staff shortcuts.
    </p>
  );
}
