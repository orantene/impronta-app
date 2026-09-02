"use client";

// WP1 (2026-09-02) — extracted verbatim from the deleted SitePage.tsx stub.
// The only survivor of that file: three website surfaces render this chip.

import { useT } from "@/i18n/use-t";
import { COLORS, FONTS } from "../state";

// Page-status discriminant → catalog key (localized label via the *_KEY map pattern).
const PAGE_STATUS_LABEL_KEY: Record<"published" | "draft" | "scheduled" | "archived", string> = {
  published: "dashboard.adminSite.pageStatus.published",
  draft: "dashboard.adminSite.pageStatus.draft",
  scheduled: "dashboard.adminSite.pageStatus.scheduled",
  archived: "dashboard.adminSite.pageStatus.archived",
};

export function PageStatusChip({
  status,
}: {
  status: "published" | "draft" | "scheduled" | "archived";
}) {
  const t = useT();
  const map = {
    published: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    draft:     { bg: COLORS.surfaceAlt,  fg: COLORS.inkMuted },
    scheduled: { bg: COLORS.indigoSoft,  fg: COLORS.indigoDeep },
    archived:  { bg: COLORS.surfaceAlt,  fg: COLORS.inkDim },
  } as const;
  const m = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.fg, fontSize: 11, fontWeight: 600, fontFamily: FONTS.body }}>{t(PAGE_STATUS_LABEL_KEY[status])}</span>
  );
}
