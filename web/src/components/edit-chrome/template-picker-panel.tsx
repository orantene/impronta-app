"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import {
  getTemplatePreviewUrl,
  previewFamilyForRegistry,
  type UnifiedTemplateDef,
} from "@/lib/site-admin/builder-core/templates/template-def";

/**
 * TemplatePickerPanel — the ONE shared template picker (ONB-3).
 *
 * Both talent-site dashboards consume this single component instead of
 * maintaining two visually-divergent pickers:
 *   - the discovery-profile slot-template picker (was `TalentSiteTemplatePanel`),
 *   - the Max multi-page-site freeform starter gallery (was the inline
 *     `TemplateGallery` in `TalentMaxSiteManager`).
 *
 * It renders `UnifiedTemplateDef` cards (TMPL-1) with identical card anatomy on
 * every surface — thumbnail (image or a CSS-wireframe fallback), label, blurb,
 * emphasis tag, a tier pill, an owner-gated "Preview with your details" eye-link
 * built from the SHARED `getTemplatePreviewUrl` helper (TMPL-2), and an Apply
 * button. The preview family is derived from each def's `registryKind`, so the
 * panel never branches on a `mode` to build a preview URL.
 *
 * The only legitimate per-surface difference — the apply BACKEND — is injected
 * by the caller as `onApply`. The two live apply mechanisms (slot-based
 * `applyTalentSiteTemplateAction` → TalentSiteSnapshot vs freeform
 * `applyMaxSiteTemplateAction` → BuilderNode[]) cannot share an implementation
 * and are NOT force-merged here; the panel just dispatches to whichever the
 * caller wires. That is the explicit safe boundary from the plan: unify the UI,
 * not the actions.
 */

export type TemplatePickerMode = "profile" | "site";

export type TemplatePickerApplyResult = {
  ok: boolean;
  error?: string | null;
};

export type TemplatePickerPanelProps = {
  /** Which dashboard mounts the picker. Used only for copy + confirm wording. */
  mode: TemplatePickerMode;
  /** The unified template descriptors (already converted via toUnifiedTemplateDef). */
  templates: UnifiedTemplateDef[];
  /** The currently-applied template key, for the selected highlight. */
  currentKey?: string | null;
  /** Talent profile id used to build the owner-gated hydrated preview URL. */
  talentProfileId?: string | null;
  /**
   * Apply backend, injected by the caller (the only per-surface seam). Receives
   * the chosen template key, returns the action result. The panel owns the
   * pending / error / confirm UI around it.
   */
  onApply: (key: string) => Promise<TemplatePickerApplyResult>;
  /**
   * Optional CSS-wireframe fallback when a def has no `thumbnailUrl` image
   * (the Max-site starters render a keyed wireframe rather than a screenshot).
   * Surface-agnostic: the panel calls it with the template key and shows the
   * gradient placeholder if it returns null.
   */
  renderFallbackThumb?: (key: string) => React.ReactNode;
  /** Optional heading shown above the grid. */
  heading?: string;
  /** Optional helper copy shown under the heading. */
  description?: React.ReactNode;
  /**
   * When true, applying shows a window.confirm warning first (the Max-site
   * apply REPLACES the current draft home + shell). Defaults to true for the
   * 'site' mode (destructive whole-site replace) and false for 'profile'.
   */
  confirmBeforeApply?: boolean;
};

export function TemplatePickerPanel({
  mode,
  templates,
  currentKey,
  talentProfileId,
  onApply,
  renderFallbackThumb,
  heading,
  description,
  confirmBeforeApply,
}: TemplatePickerPanelProps) {
  const [pending, startTransition] = useTransition();
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shouldConfirm = confirmBeforeApply ?? mode === "site";

  function handleApply(def: UnifiedTemplateDef) {
    if (
      shouldConfirm &&
      typeof window !== "undefined" &&
      !window.confirm(
        `Apply the "${def.label}" starter? This replaces your current draft home page and site shell with this layout, pre-filled with your details. Your published site is not changed until you publish.`,
      )
    ) {
      return;
    }
    setApplyingKey(def.key);
    startTransition(async () => {
      setError(null);
      const result = await onApply(def.key);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setApplyingKey(null);
        return;
      }
      setApplyingKey(null);
    });
  }

  return (
    <div style={{ fontFamily: FONTS.body }}>
      {heading ? <div style={sectionLabel}>{heading}</div> : null}
      {description ? (
        <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, maxWidth: 560 }}>
          {description}
        </p>
      ) : null}

      {error ? (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: COLORS.criticalDeep }}>{error}</p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {templates.map((def) => {
          const selected = !!currentKey && def.key === currentKey;
          const previewFamily = previewFamilyForRegistry(def.registryKind);
          const isApplying = pending && applyingKey === def.key;
          return (
            <div
              key={def.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "12px 13px",
                background: COLORS.surfaceAlt,
                border: `1px solid ${selected ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <TemplateThumb
                def={def}
                previewFamily={previewFamily}
                talentProfileId={talentProfileId}
                renderFallbackThumb={renderFallbackThumb}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{def.label}</span>
                {selected ? <Pill tone="indigo">Current</Pill> : null}
                {def.tier && def.tier !== "free" ? (
                  <Pill tone="muted">{def.tier === "max" ? "Portfolio" : "Pro"}</Pill>
                ) : null}
              </div>

              {def.emphasisTag ? (
                <span style={{ fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 600, letterSpacing: 0.2 }}>
                  {def.emphasisTag}
                </span>
              ) : null}

              <p style={{ margin: "0 0 8px", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
                {def.blurb}
              </p>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "auto" }}>
                <button
                  type="button"
                  onClick={() => handleApply(def)}
                  disabled={pending}
                  style={{ ...miniBtn, alignSelf: "flex-start" }}
                >
                  {isApplying ? "Applying…" : selected ? "Re-apply" : "Apply"}
                </button>
                {/* Eye / Preview — opens the SHARED owner-gated hydrated preview
                    route with this talent's real data (?talent param). */}
                <a
                  href={getTemplatePreviewUrl(def.key, {
                    talentProfileId,
                    family: previewFamily,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Preview with your details"
                  aria-label={`Preview ${def.label} with your details`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: COLORS.inkMuted,
                    textDecoration: "none",
                  }}
                >
                  <EyeGlyph />
                  Preview
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Thumbnail ────────────────────────────────────────────────────────────────

function TemplateThumb({
  def,
  previewFamily,
  talentProfileId,
  renderFallbackThumb,
}: {
  def: UnifiedTemplateDef;
  previewFamily: "talent-site" | "max-site";
  talentProfileId?: string | null;
  renderFallbackThumb?: (key: string) => React.ReactNode;
}) {
  const hasImage = !!def.thumbnailUrl;
  const fallback = !hasImage && renderFallbackThumb ? renderFallbackThumb(def.key) : null;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        border: `1px solid ${COLORS.borderSoft}`,
        background: COLORS.surfaceAlt,
        aspectRatio: hasImage ? "8 / 5" : undefined,
      }}
    >
      {hasImage ? (
        <Image
          src={def.thumbnailUrl as string}
          alt=""
          width={1200}
          height={750}
          sizes="(max-width: 720px) 80vw, 220px"
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : fallback ? (
        fallback
      ) : (
        <GradientPlaceholder seed={def.key} />
      )}
      {/* Eye overlay only when there is an image to overlay (the wireframe
          fallback already shows a Preview link in the card footer). */}
      {hasImage ? (
        <a
          href={getTemplatePreviewUrl(def.key, { talentProfileId, family: previewFamily })}
          target="_blank"
          rel="noopener noreferrer"
          title="Preview with your details"
          aria-label={`Preview ${def.label} with your details`}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "rgba(17,17,17,0.62)",
            color: "#fff",
            fontSize: 13,
            lineHeight: 1,
            textDecoration: "none",
          }}
        >
          <EyeGlyph size={15} />
        </a>
      ) : null}
    </div>
  );
}

function GradientPlaceholder({ seed }: { seed: string }) {
  // Deterministic hue from the key so each card has a stable, distinct tint.
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return (
    <div
      aria-hidden
      style={{
        height: 64,
        background: `linear-gradient(135deg, hsl(${h} 22% 90%), hsl(${(h + 40) % 360} 24% 82%))`,
      }}
    />
  );
}

// ── Glyph + pills ────────────────────────────────────────────────────────────

function EyeGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "indigo" | "muted" }) {
  const palette =
    tone === "indigo"
      ? { fg: COLORS.indigoDeep, bg: COLORS.indigoSoft }
      : { fg: COLORS.inkMuted, bg: COLORS.surfaceAlt };
  return (
    <span
      style={{
        padding: "1px 7px",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: palette.fg,
        background: palette.bg,
        borderRadius: 999,
      }}
    >
      {children}
    </span>
  );
}

// ── Shared chrome ────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.ink,
};

const miniBtn: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 7,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.ink,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONTS.body,
};
