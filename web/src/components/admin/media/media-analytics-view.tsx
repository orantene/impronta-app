/**
 * media-analytics-view.tsx — the Media page's Analytics lane plus the small
 * formatting helpers it shares with the lightbox (bytes, dimensions, dates,
 * variant labels). Extracted from media-page.tsx (which sat exactly at its
 * file-size budget) to make room for the Lifestyle stock lane without raising
 * the budget. Behaviour-identical: the two hex literals that lived here moved
 * to the equivalent Tailwind classes (`bg-white`, `text-white`).
 */

"use client";

import { useMemo } from "react";

import { useT } from "@/i18n/use-t";

import type {
  WorkspaceMediaPhoto as BridgeMediaPhoto,
  WorkspaceMediaFolder as BridgeMediaFolder,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge-media";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";

type MediaPhoto = BridgeMediaPhoto;
type MediaFolder = BridgeMediaFolder;

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDim(w: number | null, h: number | null) {
  if (!w || !h) return "—";
  return `${w} × ${h}`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// English values are the non-UI fallback; UI renders `t(VARIANT_LABEL_KEYS[k])`.
const VARIANT_LABELS: Record<string, string> = {
  card: "Profile", hero: "Cover", gallery: "Gallery",
  lightbox: "Lightbox", polaroid: "Polaroid", reel: "Reel",
  public_watermarked: "Public WM", watermarked: "Watermarked",
};

const VARIANT_LABEL_KEYS: Record<string, string> = {
  card: "dashboard.adminMedia.variant.card",
  hero: "dashboard.adminMedia.variant.hero",
  gallery: "dashboard.adminMedia.variant.gallery",
  lightbox: "dashboard.adminMedia.variant.lightbox",
  polaroid: "dashboard.adminMedia.variant.polaroid",
  reel: "dashboard.adminMedia.variant.reel",
  public_watermarked: "dashboard.adminMedia.variant.publicWatermarked",
  watermarked: "dashboard.adminMedia.variant.watermarked",
};

/** Localized variant label; falls back to the English map, then the raw key. */
export function variantLabel(t: (key: string) => string, kind: string): string {
  const key = VARIANT_LABEL_KEYS[kind];
  return key ? t(key) : (VARIANT_LABELS[kind] ?? kind);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ padding: "16px 18px", borderRadius: 12, border: `1px solid ${COLORS.borderSoft}` }} className="bg-white">
      <div style={{ fontFamily: FONTS.body, fontSize: 12, marginBottom: 4 }} className="text-admin-ink-muted">{label}</div>
      <div style={{ fontFamily: FONTS.body, fontSize: 22, fontWeight: 700 }} className="text-admin-ink">{value}</div>
      {sub && <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{sub}</div>}
    </div>
  );
}

export function AnalyticsView({ photos, folders }: { photos: MediaPhoto[]; folders: MediaFolder[] }) {
  const t = useT();
  // Q5: previously two separate useMemo calls (byTalent + byKind) with the
  // same `[photos]` dep, plus an unmemoized `totalBytes` reduce. React
  // Compiler bailed on preserving the second useMemo
  // (preserve-manual-memoization at L1180). Folded all three into one
  // useMemo with the same single dep — Compiler can preserve a single
  // computed object cleanly, and `totalBytes` is now memoized too.
  const { byTalent, byKind, totalBytes } = useMemo(() => {
    const talentMap = new Map<string, { count: number; pending: number; bytes: number }>();
    const kindMap = new Map<string, number>();
    let total = 0;
    for (const p of photos) {
      const cur = talentMap.get(p.talentName) ?? { count: 0, pending: 0, bytes: 0 };
      talentMap.set(p.talentName, {
        count: cur.count + 1,
        pending: cur.pending + (p.approvalState === "pending" ? 1 : 0),
        bytes: cur.bytes + (p.fileSizeBytes ?? 0),
      });
      kindMap.set(p.variantKind, (kindMap.get(p.variantKind) ?? 0) + 1);
      total += p.fileSizeBytes ?? 0;
    }
    return {
      byTalent: Array.from(talentMap.entries()).sort((a, b) => b[1].count - a[1].count),
      byKind: Array.from(kindMap.entries()).sort((a, b) => b[1] - a[1]),
      totalBytes: total,
    };
  }, [photos]);

  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", flex: 1 }}>
      <div style={{ fontFamily: FONTS.body, fontSize: 18, fontWeight: 700, marginBottom: 20 }} className="text-admin-ink">{t("dashboard.adminMedia.navAnalytics")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard label={t("dashboard.adminMedia.statTotalPhotos")} value={photos.length} />
        <StatCard label={t("dashboard.adminMedia.statTotalStorage")} value={formatBytes(totalBytes)} />
        <StatCard label={t("dashboard.adminMedia.sectionFolders")} value={folders.length} />
        <StatCard label={t("dashboard.adminMedia.navPendingReview")} value={photos.filter((p) => p.approvalState === "pending").length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, marginBottom: 12 }} className="text-admin-ink">{t("dashboard.adminMedia.navByTalent")}</div>
          <div className="flex flex-col gap-1.5">
            {byTalent.slice(0, 10).map(([name, stats]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">{name}</div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, whiteSpace: "nowrap" }} className="text-admin-ink-muted">{stats.count} · {formatBytes(stats.bytes)}</div>
                {stats.pending > 0 && <span className="text-white" style={{ background: COLORS.amber, borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>{stats.pending}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, marginBottom: 12 }} className="text-admin-ink">{t("dashboard.adminMedia.byVariantKind")}</div>
          <div className="flex flex-col gap-1.5">
            {byKind.map(([kind, count]) => (
              <div key={kind} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink">{variantLabel(t, kind)}</div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

