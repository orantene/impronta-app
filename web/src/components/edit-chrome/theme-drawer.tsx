"use client";

/**
 * ThemeDrawer — engaged-state design / theme editor (Phase 5).
 *
 * Implements builder-experience.html surface §12 (Theme — global design
 * system). Last reconciled: 2026-04-25.
 *
 * Lives next to PageSettingsDrawer and RevisionsDrawer in the right-side
 * drawer family. Same chrome shape: paper-tinted body, white cards float on
 * top, pill-tab navigation, footer with primary action.
 *
 * Five tabs:
 *   - Colors        — brand + editorial palette (color swatches + hex inputs)
 *   - Typography    — heading + body + label + scale + tracking presets
 *   - Layout        — spacing scale, section padding, container width,
 *                     radius preset, page background mode
 *   - Effects       — shadow + motion + stagger presets
 *   - Code          — read-only JSON of the current draft for copy + paste
 *                     into version-controlled brand kits
 *
 * Wires:
 *   - On open, calls `loadDesignAction` once to seed the working copy from
 *     `agency_branding.theme_json_draft`. The working copy is the FULL
 *     resolved map (registry defaults under operator overrides) so the
 *     drawer always has a value to render for every control even if the
 *     row only stores 3 keys today.
 *   - "Save draft" sends the full working copy through
 *     `saveDesignDraftFromEditAction` — patch is full-replacement (same as
 *     the /admin/site-settings/design route). NO cache bust, draft has no
 *     storefront effect.
 *   - "Publish" calls `publishDesignFromEditAction` after a "this goes
 *     live" confirm step. Busts the branding + storefront cache tags and
 *     `router.refresh()`-es so the canvas picks up the new tokens.
 *
 * Token isolation: this drawer NEVER writes M1 branding (logo / fonts /
 * primary_color) — those stay on the saveBranding pathway. The shared
 * `agency_branding.version` is the CAS target (one row, one version) so a
 * branding edit between draft save and publish surfaces as VERSION_CONFLICT
 * via the normal mutation-error toast.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardBody,
  CardHead,
  CHROME,
  CHROME_SHADOWS,
  ColorRow,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  DrawerTab,
  DrawerTabs,
  Field,
  FieldLabel,
  Helper,
  SaveChip,
  Segmented,
  type SegmentedOption,
} from "./kit";
import { useEditContext } from "./edit-context";

import {
  loadDesignAction,
  publishDesignFromEditAction,
  saveDesignDraftFromEditAction,
  type DesignSnapshot,
} from "@/lib/site-admin/edit-mode/design-actions";
import { tokenDefaults } from "@/lib/site-admin/tokens/registry";
import { GoogleFontPicker } from "./GoogleFontPicker";
import { ContrastChecker } from "./ContrastChecker";
import { BrandKitImport } from "./BrandKitImport";
import { MeshGradientGenerator } from "./MeshGradientGenerator";
import { classifyContrast, contrastRatio } from "@/lib/site-admin/a11y/contrast";

// ── tabs ─────────────────────────────────────────────────────────────────

// Phase A (2026-04-26) — convergence-plan §1 / mockup §12.
// Tab strip kept verbatim from the approved prototype (Colors / Typography /
// Layout / Effects / Code). The "calmer Theme experience" is delivered INSIDE
// the Code tab (formerly a wall of three peer surfaces — JSON + import +
// nothing for mesh) by introducing a clear two-card hierarchy: Theme JSON at
// top, Power tools disclosure card below. The everyday tabs (Colors →
// Typography → Layout → Effects) are unchanged.
type TabKey = "colors" | "typography" | "layout" | "effects" | "code";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "colors", label: "Colors" },
  { key: "typography", label: "Typography" },
  { key: "layout", label: "Layout" },
  { key: "effects", label: "Effects" },
  { key: "code", label: "Code" },
];

// ── token groupings the drawer exposes ────────────────────────────────────

interface ColorSpec {
  key: string;
  label: string;
  hint?: string;
}

const BRAND_COLORS: ReadonlyArray<ColorSpec> = [
  { key: "color.primary", label: "Primary", hint: "Buttons, links, focus rings." },
  { key: "color.secondary", label: "Secondary", hint: "Supporting UI text." },
  { key: "color.accent", label: "Accent", hint: "Highlights, badges, hover tints." },
  { key: "color.neutral", label: "Neutral", hint: "Quiet text + subtle borders." },
];

const EDITORIAL_COLORS: ReadonlyArray<ColorSpec> = [
  { key: "color.blush", label: "Blush" },
  { key: "color.sage", label: "Sage" },
  { key: "color.ink", label: "Ink" },
  { key: "color.muted", label: "Muted text" },
  { key: "color.line", label: "Divider" },
  { key: "color.surface-raised", label: "Surface" },
];

interface PresetSpec<T extends string = string> {
  key: string;
  label: string;
  hint?: string;
  options: ReadonlyArray<SegmentedOption<T>>;
}

const TYPOGRAPHY_PRESETS: ReadonlyArray<PresetSpec> = [
  {
    key: "typography.heading-preset",
    label: "Heading font",
    options: [
      { value: "sans", label: "Sans" },
      { value: "serif", label: "Serif" },
      { value: "display", label: "Display" },
      { value: "editorial-serif", label: "Editorial serif" },
    ],
  },
  {
    key: "typography.body-preset",
    label: "Body font",
    options: [
      { value: "sans", label: "Sans" },
      { value: "serif", label: "Serif" },
      { value: "refined-sans", label: "Refined sans" },
    ],
  },
  {
    key: "typography.label-preset",
    label: "Eyebrow / label",
    options: [
      { value: "uppercase-tracked", label: "Tracked caps" },
      { value: "italic-serif", label: "Italic serif" },
      { value: "sans-bold", label: "Sans bold" },
    ],
  },
  {
    key: "typography.scale-preset",
    label: "Type scale",
    options: [
      { value: "compact", label: "Compact" },
      { value: "standard", label: "Standard" },
      { value: "editorial", label: "Editorial" },
    ],
  },
  {
    key: "typography.tracking-preset",
    label: "Heading tracking",
    options: [
      { value: "tight", label: "Tight" },
      { value: "normal", label: "Normal" },
      { value: "editorial", label: "Loose" },
    ],
  },
];

const LAYOUT_PRESETS: ReadonlyArray<PresetSpec> = [
  {
    key: "spacing.scale",
    label: "Spacing rhythm",
    options: [
      { value: "compact", label: "Compact" },
      { value: "cozy", label: "Cozy" },
      { value: "comfortable", label: "Comfortable" },
      { value: "editorial", label: "Editorial" },
    ],
  },
  {
    key: "density.section-padding",
    label: "Section padding",
    options: [
      { value: "tight", label: "Tight" },
      { value: "standard", label: "Standard" },
      { value: "airy", label: "Airy" },
      { value: "editorial", label: "Editorial" },
    ],
  },
  {
    key: "density.container-width",
    label: "Container width",
    options: [
      { value: "narrow", label: "Narrow" },
      { value: "standard", label: "Standard" },
      { value: "wide", label: "Wide" },
      { value: "editorial", label: "Editorial" },
    ],
  },
  {
    key: "radius.scale-preset",
    label: "Corner radius",
    options: [
      { value: "sharp", label: "Sharp" },
      { value: "soft", label: "Soft" },
      { value: "pillowy", label: "Pillowy" },
      { value: "pill", label: "Pill" },
    ],
  },
  {
    key: "background.mode",
    label: "Page background",
    hint: "Editorial backgrounds layer subtle warmth or grain over the page.",
    options: [
      { value: "plain", label: "Plain" },
      { value: "aurora", label: "Aurora" },
      { value: "editorial-ivory", label: "Ivory" },
      { value: "editorial-noir", label: "Noir" },
      { value: "champagne-gradient", label: "Champagne" },
      { value: "noise-texture", label: "Noise" },
      { value: "mesh-blush", label: "Mesh blush" },
      { value: "mesh-sage", label: "Mesh sage" },
      { value: "mesh-noir", label: "Mesh noir" },
      { value: "mesh-aurora", label: "Mesh aurora" },
      { value: "noise-animated", label: "Noise (animated)" },
    ],
  },
];

const EFFECT_PRESETS: ReadonlyArray<PresetSpec> = [
  {
    key: "shadow.preset",
    label: "Shadow weight",
    options: [
      { value: "none", label: "None" },
      { value: "crisp", label: "Crisp" },
      { value: "soft", label: "Soft" },
      { value: "ambient", label: "Ambient" },
    ],
  },
  {
    key: "motion.preset",
    label: "Motion feel",
    hint: "All presets respect prefers-reduced-motion.",
    options: [
      { value: "none", label: "None" },
      { value: "snappy", label: "Snappy" },
      { value: "refined", label: "Refined" },
      { value: "editorial", label: "Editorial" },
    ],
  },
  {
    key: "motion.stagger-preset",
    label: "Reveal stagger",
    options: [
      { value: "none", label: "None" },
      { value: "subtle", label: "Subtle" },
      { value: "editorial", label: "Editorial" },
      { value: "dramatic", label: "Dramatic" },
    ],
  },
];

// ── icons ────────────────────────────────────────────────────────────────

function ThemeIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-2 2z" />
      <circle cx="6.5" cy="12.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="17.5" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}

function CodeIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function PaletteIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="7" cy="10" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
      <circle cx="17" cy="10" r="1" fill="currentColor" />
      <circle cx="14" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function TypeIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function GridIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function SparkleIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l3 3M15.5 15.5l3 3M5.5 18.5l3-3M15.5 8.5l3-3" />
    </svg>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function patchesEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

// ── component ─────────────────────────────────────────────────────────────

export function ThemeDrawer(): ReactElement | null {
  const { themeOpen, closeTheme } = useEditContext();
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<DesignSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [tab, setTab] = useState<TabKey>("colors");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading" | "saving" | "publishing">(
    "idle",
  );
  const [confirmingPublish, setConfirmingPublish] = useState(false);

  // Lazy-load on open. Re-fetch every open so a publish from the
  // /admin/site-settings/design route shows up the next time the operator
  // pops the drawer.
  useEffect(() => {
    if (!themeOpen) {
      setConfirmingPublish(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy("loading");
    setLoadError(null);
    setError(null);
    (async () => {
      const res = await loadDesignAction();
      if (cancelled) return;
      if (!res.ok) {
        setSnapshot(null);
        setDraft(null);
        setLoadError(res.error);
        setBusy("idle");
        return;
      }
      setSnapshot(res.snapshot);
      setDraft({ ...res.snapshot.themeDraft });
      setBusy("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [themeOpen]);

  const dirty = useMemo(() => {
    if (!snapshot || !draft) return false;
    return !patchesEqual(snapshot.themeDraft, draft);
  }, [snapshot, draft]);

  const draftDiffersFromLive = useMemo(() => {
    if (!snapshot || !draft) return false;
    return !patchesEqual(snapshot.themeLive, draft);
  }, [snapshot, draft]);

  const set = useCallback((key: string, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const reset = useCallback(() => {
    if (!snapshot) return;
    setDraft({ ...snapshot.themeDraft });
    setError(null);
    setConfirmingPublish(false);
  }, [snapshot]);

  const resetToDefaults = useCallback(() => {
    setDraft({ ...tokenDefaults() });
    setError(null);
    setConfirmingPublish(false);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!snapshot || !draft) return;
    setBusy("saving");
    setError(null);
    // T3-1 — Outer try/catch ensures busy state is released even when an
    // intermediate await rejects (network drop, server restart). Without
    // it the drawer stays stuck on "saving" indefinitely.
    try {
      const res = await saveDesignDraftFromEditAction({
        patch: draft,
        expectedVersion: snapshot.version,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.code === "VERSION_CONFLICT") {
          const fresh = await loadDesignAction();
          if (fresh.ok) setSnapshot(fresh.snapshot);
        }
        return;
      }
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              themeDraft: { ...res.themeDraft },
              version: res.version,
            }
          : prev,
      );
      // Keep the operator's working copy authoritative — `res.themeDraft`
      // is the same map minus any registry defaults the server filtered
      // out.
      setDraft({ ...res.themeDraft, ...draft });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error — try again.",
      );
    } finally {
      setBusy("idle");
    }
  }, [snapshot, draft]);

  const handlePublish = useCallback(async () => {
    if (!snapshot) return;
    setBusy("publishing");
    setError(null);
    // T3-1 — Wrapping the multi-step publish flow in try/catch ensures
    // the busy state is released if any intermediate await rejects (e.g.
    // network drop between save and publish). Without this the drawer
    // sticks on "publishing" forever and the operator has no recovery.
    try {
      // Save the working copy first if it diverges from the stored draft,
      // so we publish what the operator sees.
      if (dirty && draft) {
        const saveRes = await saveDesignDraftFromEditAction({
          patch: draft,
          expectedVersion: snapshot.version,
        });
        if (!saveRes.ok) {
          setError(saveRes.error);
          if (saveRes.code === "VERSION_CONFLICT") {
            const fresh = await loadDesignAction();
            if (fresh.ok) setSnapshot(fresh.snapshot);
          }
          return;
        }
        const latestVersion = saveRes.version;
        const pubRes = await publishDesignFromEditAction({
          expectedVersion: latestVersion,
        });
        if (!pubRes.ok) {
          setError(pubRes.error);
          if (pubRes.code === "VERSION_CONFLICT") {
            const fresh = await loadDesignAction();
            if (fresh.ok) setSnapshot(fresh.snapshot);
          }
          return;
        }
        const fresh = await loadDesignAction();
        if (fresh.ok) {
          setSnapshot(fresh.snapshot);
          setDraft({ ...fresh.snapshot.themeDraft });
        }
        router.refresh();
        setConfirmingPublish(false);
        return;
      }
      const pubRes = await publishDesignFromEditAction({
        expectedVersion: snapshot.version,
      });
      if (!pubRes.ok) {
        setError(pubRes.error);
        if (pubRes.code === "VERSION_CONFLICT") {
          const fresh = await loadDesignAction();
          if (fresh.ok) setSnapshot(fresh.snapshot);
        }
        return;
      }
      const fresh = await loadDesignAction();
      if (fresh.ok) {
        setSnapshot(fresh.snapshot);
        setDraft({ ...fresh.snapshot.themeDraft });
      }
      router.refresh();
      setConfirmingPublish(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error — try again.",
      );
    } finally {
      setBusy("idle");
    }
  }, [snapshot, draft, dirty, router]);

  const chipStatus =
    busy === "saving" || busy === "publishing"
      ? "saving"
      : dirty
        ? "dirty"
        : "saved";

  const lastPublishedLabel = snapshot?.themePublishedAt
    ? new Date(snapshot.themePublishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  if (!themeOpen) return null;

  return (
    <Drawer kind="theme" open={themeOpen} zIndex={87}>
      <DrawerHead
        title={
          snapshot?.presetSlug
            ? `Theme · ${prettyPreset(snapshot.presetSlug)}`
            : "Theme · Custom"
        }
        icon={<ThemeIcon />}
        saveChip={<SaveChip status={chipStatus} />}
        meta={
          <>
            {lastPublishedLabel ? `Published ${lastPublishedLabel}` : "Never published"}
            {snapshot ? (
              <>
                <span style={{ color: CHROME.muted2 }}> · </span>v{snapshot.version}
              </>
            ) : null}
          </>
        }
        onClose={busy === "publishing" ? undefined : closeTheme}
      />

      <DrawerTabs>
        {TABS.map((t) => (
          <DrawerTab
            key={t.key}
            active={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </DrawerTab>
        ))}
      </DrawerTabs>

      <DrawerBody>
        {loadError ? (
          <ErrorBanner>{loadError}</ErrorBanner>
        ) : !snapshot || !draft ? (
          <ThemeSkeleton />
        ) : (
          <>
            {error ? <ErrorBanner>{error}</ErrorBanner> : null}

            {tab === "colors" ? (
              <ColorsTab draft={draft} onChange={set} />
            ) : null}
            {tab === "typography" ? (
              <>
                <PresetsTab
                  cardTitle="Typography"
                  icon={<TypeIcon />}
                  presets={TYPOGRAPHY_PRESETS}
                  draft={draft}
                  onChange={set}
                />
                <Card>
                  <CardHead icon={<TypeIcon />} title="Google Fonts" />
                  <CardBody>
                    <Field>
                      <FieldLabel htmlFor="theme-typography.heading-font-family">
                        Heading family
                      </FieldLabel>
                      <GoogleFontPicker
                        slot="heading"
                        value={draft["typography.heading-font-family"] ?? ""}
                        onChange={(v) =>
                          set("typography.heading-font-family", v)
                        }
                      />
                      <Helper>
                        Overrides the heading-preset above. Loads on save +
                        publish.
                      </Helper>
                    </Field>
                    <Field flush>
                      <FieldLabel htmlFor="theme-typography.body-font-family">
                        Body family
                      </FieldLabel>
                      <GoogleFontPicker
                        slot="body"
                        value={draft["typography.body-font-family"] ?? ""}
                        onChange={(v) =>
                          set("typography.body-font-family", v)
                        }
                      />
                    </Field>
                  </CardBody>
                </Card>

                <Card>
                  <CardHead icon={<TypeIcon />} title="Type scale (h1–h6)" />
                  <CardBody>
                    {(
                      [
                        ["typography.h1-size", "H1", "clamp(40px, 6vw, 72px)"],
                        ["typography.h2-size", "H2", "clamp(28px, 4vw, 48px)"],
                        ["typography.h3-size", "H3", "clamp(22px, 3vw, 32px)"],
                        ["typography.h4-size", "H4", "clamp(18px, 2.4vw, 24px)"],
                        ["typography.h5-size", "H5", "16px"],
                        ["typography.h6-size", "H6", "14px"],
                        ["typography.body-size", "Body", "16px"],
                      ] as const
                    ).map(([key, label, placeholder], i, arr) => (
                      <Field key={key} flush={i === arr.length - 1}>
                        <FieldLabel htmlFor={`theme-${key}`}>{label}</FieldLabel>
                        <input
                          id={`theme-${key}`}
                          type="text"
                          placeholder={placeholder}
                          value={draft[key] ?? ""}
                          onChange={(e) => set(key, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "6px 9px",
                            border: `1px solid ${CHROME.lineMid}`,
                            borderRadius: 6,
                            background: CHROME.surface2,
                            boxShadow: CHROME_SHADOWS.inputInset,
                            fontFamily:
                              'ui-monospace, "SF Mono", Menlo, monospace',
                            fontSize: 12,
                          }}
                        />
                      </Field>
                    ))}
                    <Helper>
                      Free CSS length values (clamp(), px, rem, %). Empty = use
                      the type-scale preset above.
                    </Helper>
                  </CardBody>
                </Card>
              </>
            ) : null}
            {tab === "layout" ? (
              <PresetsTab
                cardTitle="Layout"
                icon={<GridIcon />}
                presets={LAYOUT_PRESETS}
                draft={draft}
                onChange={set}
              />
            ) : null}
            {tab === "effects" ? (
              <PresetsTab
                cardTitle="Effects"
                icon={<SparkleIcon />}
                presets={EFFECT_PRESETS}
                draft={draft}
                onChange={set}
              />
            ) : null}
            {tab === "code" ? (
              <AdvancedTab
                draft={draft}
                onResetDefaults={resetToDefaults}
                onBulkApply={(tokens) => {
                  for (const [k, v] of Object.entries(tokens)) {
                    set(k, v);
                  }
                }}
              />
            ) : null}
          </>
        )}
      </DrawerBody>

      {snapshot && draft ? (
        <DrawerFoot
          start={
            confirmingPublish ? (
              <span style={{ fontSize: 11, color: CHROME.text2 }}>
                {(() => {
                  // Phase 13 — contrast warning at publish time. Computes
                  // the same pairings ContrastChecker shows in the Colors
                  // tab and warns if any FAIL the AA threshold (ratio < 3).
                  // Doesn't block — operator can still ship if they accept
                  // the trade-off.
                  const pairs: Array<[string, string]> = [
                    ["color.ink", "color.surface-raised"],
                    ["color.primary", "color.background"],
                    ["color.secondary", "color.surface-raised"],
                    ["color.muted", "color.surface-raised"],
                    ["color.accent", "color.background"],
                  ];
                  const fallback: Record<string, string> = {
                    "color.ink": "#111111",
                    "color.surface-raised": "#ffffff",
                    "color.primary": "#111111",
                    "color.background": "#ffffff",
                    "color.secondary": "#444444",
                    "color.muted": "#666666",
                    "color.accent": "#111111",
                  };
                  const failing = pairs.filter(([fg, bg]) => {
                    const r = contrastRatio(
                      draft[fg] || fallback[fg],
                      draft[bg] || fallback[bg],
                    );
                    return classifyContrast(r) === "fail";
                  });
                  const base = draftDiffersFromLive
                    ? "This will replace what visitors see."
                    : "Re-publish current draft?";
                  if (failing.length > 0) {
                    return `⚠ ${failing.length} color pair${failing.length > 1 ? "s fail" : " fails"} WCAG AA. ${base}`;
                  }
                  return base;
                })()}
              </span>
            ) : (
              <button
                type="button"
                onClick={reset}
                disabled={!dirty || busy !== "idle"}
                style={{
                  height: 30,
                  padding: "0 10px",
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: dirty ? CHROME.muted : CHROME.muted2,
                  background: "transparent",
                  border: "none",
                  cursor: dirty && busy === "idle" ? "pointer" : "not-allowed",
                  textDecoration: dirty ? "underline" : "none",
                  textUnderlineOffset: 3,
                }}
              >
                Discard changes
              </button>
            )
          }
          end={
            confirmingPublish ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingPublish(false)}
                  disabled={busy === "publishing"}
                  style={btnGhostStyle(busy === "publishing")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={busy === "publishing"}
                  style={btnPrimaryStyle(busy === "publishing")}
                >
                  {busy === "publishing" ? "Publishing…" : "Yes, publish"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={!dirty || busy !== "idle"}
                  style={btnGhostStyle(!dirty || busy !== "idle")}
                  title="Save your changes without going live"
                >
                  {busy === "saving" ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingPublish(true)}
                  disabled={
                    busy !== "idle" || (!dirty && !draftDiffersFromLive)
                  }
                  style={btnPrimaryStyle(
                    busy !== "idle" || (!dirty && !draftDiffersFromLive),
                  )}
                  title={
                    dirty || draftDiffersFromLive
                      ? "Publish theme to live storefront"
                      : "Draft already matches live"
                  }
                >
                  Publish theme
                </button>
              </>
            )
          }
        />
      ) : null}
    </Drawer>
  );
}

// ── tab content ───────────────────────────────────────────────────────────

function ColorsTab({
  draft,
  onChange,
}: {
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      <Card>
        <CardHead icon={<PaletteIcon />} title="Brand colors" />
        <CardBody>
          {BRAND_COLORS.map((c, i) => (
            <Field key={c.key} flush={i === BRAND_COLORS.length - 1}>
              <FieldLabel htmlFor={`theme-${c.key}`}>{c.label}</FieldLabel>
              <ColorRow
                value={draft[c.key] ?? ""}
                onChange={(v) => onChange(c.key, v)}
              />
              {c.hint ? <Helper>{c.hint}</Helper> : null}
            </Field>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHead icon={<PaletteIcon />} title="Editorial palette" />
        <CardBody>
          {EDITORIAL_COLORS.map((c, i) => (
            <Field key={c.key} flush={i === EDITORIAL_COLORS.length - 1}>
              <FieldLabel htmlFor={`theme-${c.key}`}>{c.label}</FieldLabel>
              <ColorRow
                value={draft[c.key] ?? ""}
                onChange={(v) => onChange(c.key, v)}
              />
            </Field>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHead icon={<PaletteIcon />} title="A11y · contrast" />
        <CardBody>
          <ContrastChecker draft={draft} />
        </CardBody>
      </Card>
    </>
  );
}

function PresetsTab({
  cardTitle,
  icon,
  presets,
  draft,
  onChange,
}: {
  cardTitle: string;
  icon: ReactElement;
  presets: ReadonlyArray<PresetSpec>;
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <Card>
      <CardHead icon={icon} title={cardTitle} />
      <CardBody>
        {presets.map((p, i) => (
          <Field key={p.key} flush={i === presets.length - 1}>
            <FieldLabel htmlFor={`theme-${p.key}`}>{p.label}</FieldLabel>
            <Segmented
              value={draft[p.key] ?? p.options[0]?.value ?? ""}
              onChange={(v) => onChange(p.key, v)}
              options={p.options}
              fullWidth
              compact
            />
            {p.hint ? <Helper>{p.hint}</Helper> : null}
          </Field>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * Phase A (2026-04-26) — convergence-plan §1 / mockup §12.
 *
 * The legacy CodeTab mixed three things into one panel without hierarchy:
 * the JSON view, the brand-kit importer, and (implicitly) anywhere else the
 * theme had power-user tools. AdvancedTab restores the hierarchy:
 *
 *   1. **Theme JSON** card — read-only export + copy + reset (the original
 *      CodeTab payload). This is the single most-used advanced affordance,
 *      so it stays at the top.
 *   2. **Power tools** disclosures — BrandKitImport and MeshGradientGenerator.
 *      Each is its own collapsed-by-default `<details>` block so the panel
 *      reads as a quiet menu of options, not a wall of three competing
 *      surfaces. Operators who don't need them never see their bodies.
 *
 * The everyday tabs (Colors / Typography / Layout / Effects) are unchanged.
 * The "Advanced" label on the tab itself signals: power-user territory,
 * not "secret features." Compare against builder-experience.html §12.
 */
function AdvancedTab({
  draft,
  onResetDefaults,
  onBulkApply,
}: {
  draft: Record<string, string>;
  onResetDefaults: () => void;
  onBulkApply: (tokens: Record<string, string>) => void;
}) {
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => {
    const sorted: Record<string, string> = {};
    for (const k of Object.keys(draft).sort()) sorted[k] = draft[k];
    return JSON.stringify(sorted, null, 2);
  }, [draft]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard write can be blocked in headless / iframe contexts; the
      // textarea is selectable as a fallback so we don't surface an error.
    }
  }, [json]);

  return (
    <>
      <Card>
        <CardHead
          icon={<CodeIcon />}
          title="Theme JSON"
          sub={`${Object.keys(draft).length} tokens`}
          action={
            <button
              type="button"
              onClick={() => void onCopy()}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: copied ? CHROME.green : CHROME.blue,
                background: "transparent",
                border: "none",
                padding: "2px 4px",
                cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          }
        />
        <CardBody padding="tight">
          <textarea
            readOnly
            value={json}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 240,
              maxHeight: "60vh",
              padding: "10px 12px",
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: CHROME.text2,
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 7,
              resize: "vertical",
              outline: "none",
              boxShadow: CHROME_SHADOWS.inputInset,
            }}
          />
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, color: CHROME.muted }}>
              Read-only — edit through the controls above.
            </span>
            <button
              type="button"
              onClick={onResetDefaults}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: CHROME.muted,
                background: "transparent",
                border: "none",
                padding: "2px 4px",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Reset to platform defaults
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          icon={null}
          title="Power tools"
          sub="Bulk-apply tokens or generate visual recipes."
        />
        <CardBody>
          <details
            style={{
              borderRadius: 7,
              border: `1px solid ${CHROME.line}`,
              background: CHROME.surface,
              padding: "10px 12px",
              marginBottom: 8,
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: CHROME.ink,
              }}
            >
              Brand-kit import
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  fontWeight: 400,
                  color: CHROME.muted,
                }}
              >
                Paste a JSON token bundle or extract from a URL.
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              <BrandKitImport onApply={onBulkApply} />
            </div>
          </details>

          <details
            style={{
              borderRadius: 7,
              border: `1px solid ${CHROME.line}`,
              background: CHROME.surface,
              padding: "10px 12px",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: CHROME.ink,
              }}
            >
              Mesh gradient generator
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  fontWeight: 400,
                  color: CHROME.muted,
                }}
              >
                Compose a free mesh background and copy the CSS.
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              <MeshGradientGenerator />
            </div>
          </details>
        </CardBody>
      </Card>
    </>
  );
}

// ── small atoms ───────────────────────────────────────────────────────────

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-3 rounded-md px-3 py-2 text-[11px]"
      style={{
        background: CHROME.roseBg,
        border: `1px solid ${CHROME.roseLine}`,
        color: CHROME.rose,
      }}
    >
      {children}
    </div>
  );
}

function ThemeSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 96,
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            borderRadius: 10,
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}

function btnGhostStyle(disabled: boolean) {
  return {
    height: 30,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 500,
    color: disabled ? CHROME.muted2 : CHROME.text2,
    background: CHROME.surface,
    border: `1px solid ${CHROME.lineMid}`,
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const;
}

function btnPrimaryStyle(disabled: boolean) {
  return {
    height: 30,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    background: disabled ? CHROME.muted2 : CHROME.accent,
    border: "none",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 1px 2px rgba(0,0,0,0.10)",
  } as const;
}

function prettyPreset(slug: string): string {
  // Slug → "Title Case" (best-effort; presets ship with kebab-case slugs).
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
