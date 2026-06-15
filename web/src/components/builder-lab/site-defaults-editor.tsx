"use client";

/**
 * SiteDefaultsEditor (Builder Lab → Site Defaults) — the super-admin editor for
 * the PLATFORM DEFAULT THEME (the Modern 2026 Site Default every NEW tenant +
 * NEW talent page inherits).
 *
 * This is a FOCUSED editor, not the full EditProvider-coupled ThemeDrawer: the
 * ThemeDrawer takes no props and reads `useEditContext()`, so mounting it in the
 * Lab would require standing up the whole edit shell around a tenant/talent row.
 * The Site Default lives on the `platform_settings` singleton instead — no
 * tenant scope, no CAS/draft layer (Save IS publish). So this component reuses
 * the SAME data vocabulary (the token registry + theme presets + the
 * `platform_default` route in theme-action-scope) behind a lean token-grid +
 * preset-apply + live-swatch panel. A super-admin can:
 *   - see the current Site Default,
 *   - apply the Modern 2026 preset (or any other),
 *   - edit the key tokens (background / colors / fonts / radius / shadow),
 *   - Save/Publish so every new site inherits it.
 */

import { useEffect, useMemo, useState, useTransition } from "react";

import { resolvePlatformDefaultThemeActionSet } from "@/components/edit-chrome/theme-action-scope";
import { listThemePresets } from "@/lib/site-admin/presets/theme-presets";
import { SurfaceSwitcher } from "./surface-switcher";
import type { PlatformThemeSurface } from "@/lib/platform/default-theme";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

// Which surface's default the operator is editing. The shared (agency) default
// is what every new tenant inherits; the talent override falls back to it.
const SURFACE_TABS: ReadonlyArray<{ key: PlatformThemeSurface; label: string; blurb: string }> = [
  {
    key: "workspace",
    label: "Agency Site Defaults",
    blurb: "The shared default every new agency / workspace inherits.",
  },
  {
    key: "talent",
    label: "Talent Site Defaults",
    blurb: "The default for new talent pages — falls back to the agency default when unset.",
  },
];

const T = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accent: "#5DD3A0",
  field: "#1F1F25",
};

/** Color tokens surfaced as swatches. */
const COLOR_TOKENS: Array<{ key: string; label: string }> = [
  { key: "color.background", label: "Background" },
  { key: "color.ink", label: "Ink (text)" },
  { key: "color.primary", label: "Primary" },
  { key: "color.secondary", label: "Secondary" },
  { key: "color.accent", label: "Accent" },
  { key: "color.muted", label: "Muted" },
  { key: "color.line", label: "Line / border" },
  { key: "color.surface-raised", label: "Raised surface" },
];

/** Enum tokens surfaced as selects. */
const ENUM_TOKENS: Array<{ key: string; label: string; options: string[] }> = [
  {
    key: "typography.heading-preset",
    label: "Heading font",
    options: ["sans", "serif", "display", "editorial-serif", "cinzel-editorial"],
  },
  { key: "typography.body-preset", label: "Body font", options: ["sans", "serif", "refined-sans"] },
  { key: "typography.scale-preset", label: "Type scale", options: ["compact", "standard", "editorial"] },
  { key: "radius.scale-preset", label: "Radius", options: ["sharp", "soft", "pillowy", "pill"] },
  { key: "shadow.preset", label: "Shadow", options: ["none", "crisp", "soft", "ambient"] },
  { key: "spacing.scale", label: "Spacing", options: ["compact", "cozy", "comfortable", "editorial"] },
  { key: "motion.preset", label: "Motion", options: ["none", "snappy", "refined", "editorial"] },
];

/** Normalize a stored color token to a `#rrggbb` for `<input type=color>`. */
function asHex(value: string | undefined): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return "#ffffff";
}

export function SiteDefaultsEditor() {
  const [surface, setSurface] = useState<PlatformThemeSurface>("workspace");
  // Per-surface action set (talent override vs the shared/agency default).
  const actions = useMemo(
    () => resolvePlatformDefaultThemeActionSet(surface),
    [surface],
  );

  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [componentStyles, setComponentStyles] = useState<ComponentStyleDefaults>({});
  const [presetSlug, setPresetSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const presets = listThemePresets();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStatus(null);
    void actions.load().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setTokens({ ...r.theme.tokens });
        setComponentStyles(r.theme.componentStyles);
        setPresetSlug(r.theme.presetSlug);
        setLoadError(null);
      } else {
        setLoadError(r.error);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [actions]);

  const setToken = (key: string, value: string) => {
    setStatus(null);
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (slug: string) => {
    const preset = presets.find((p) => p.slug === slug);
    if (!preset) return;
    setStatus(null);
    setPresetSlug(slug);
    // Merge the preset's tokens OVER the current working copy (additive — same
    // posture as applying a preset in the ThemeDrawer).
    setTokens((prev) => ({ ...prev, ...preset.tokens }));
    if (preset.componentStyles) setComponentStyles(preset.componentStyles);
  };

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await actions.save({ tokens, componentStyles, presetSlug });
      setStatus(
        r.ok
          ? {
              ok: true,
              msg:
                surface === "talent"
                  ? "Saved — new talent pages now inherit this."
                  : "Saved — every new agency / workspace now inherits this.",
            }
          : { ok: false, msg: `Failed: ${r.error}` },
      );
    });
  };

  const activeTab = SURFACE_TABS.find((t) => t.key === surface);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Surface toggle — Agency (shared) vs Talent (override) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SurfaceSwitcher
          options={SURFACE_TABS}
          value={surface}
          onChange={setSurface}
          ariaLabel="Site default surface"
        />
        {activeTab ? (
          <div style={{ fontSize: 12, color: T.inkMuted }}>{activeTab.blurb}</div>
        ) : null}
      </div>

      {loading ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "12px 0" }}>Loading Site Default…</div>
      ) : loadError ? (
        <div style={{ color: "#f0a8a8", fontSize: 13, padding: "12px 0" }}>{loadError}</div>
      ) : (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
      {/* ── Controls ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Presets */}
        <section>
          <Legend>Start from a preset</Legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {presets.map((p) => {
              const active = presetSlug === p.slug;
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => applyPreset(p.slug)}
                  title={p.summary}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 11px",
                    borderRadius: 9,
                    border: `1px solid ${active ? T.accent : T.border}`,
                    background: active ? "rgba(93,211,160,0.12)" : T.field,
                    color: T.ink,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {p.previewSwatch && (
                    <span style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: `1px solid ${T.border}` }}>
                      {[p.previewSwatch.background, p.previewSwatch.primary, p.previewSwatch.accent].map((c, i) => (
                        <span key={i} style={{ width: 10, height: 14, background: c }} />
                      ))}
                    </span>
                  )}
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Colors */}
        <section>
          <Legend>Colors</Legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {COLOR_TOKENS.map((c) => (
              <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <input
                  type="color"
                  value={asHex(tokens[c.key])}
                  onChange={(e) => setToken(c.key, e.target.value)}
                  style={{
                    width: 30,
                    height: 30,
                    padding: 0,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    background: "none",
                    cursor: "pointer",
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, color: T.ink }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 11, color: T.inkDim, fontFamily: "ui-monospace, monospace" }}>
                    {tokens[c.key] ?? "—"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Type / shape / feel */}
        <section>
          <Legend>Type, shape &amp; feel</Legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {ENUM_TOKENS.map((f) => (
              <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11.5, color: T.inkMuted }}>{f.label}</span>
                <select
                  value={tokens[f.key] ?? f.options[0]}
                  onChange={(e) => setToken(f.key, e.target.value)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 7,
                    border: `1px solid ${T.border}`,
                    background: T.field,
                    color: T.ink,
                    fontSize: 12.5,
                  }}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            style={{
              padding: "9px 18px",
              borderRadius: 9,
              border: "none",
              background: pending ? "#3a3a42" : T.accent,
              color: "#0F0F11",
              fontSize: 13,
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
            }}
          >
            {pending ? "Saving…" : "Save & publish default"}
          </button>
          {status && (
            <span style={{ fontSize: 12.5, color: status.ok ? T.accent : "#f0a8a8" }}>{status.msg}</span>
          )}
        </div>
      </div>

      {/* ── Live preview ── */}
      <SitePreview tokens={tokens} />
    </div>
      )}
    </div>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        color: T.inkMuted,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

/** A small, self-contained preview of the default theme's key surfaces. */
function SitePreview({ tokens }: { tokens: Record<string, string> }) {
  const bg = tokens["color.background"] ?? "#ffffff";
  const ink = tokens["color.ink"] ?? "#111111";
  const muted = tokens["color.muted"] ?? "#6b7280";
  const accent = tokens["color.accent"] ?? "#0ea5e9";
  const line = tokens["color.line"] ?? "#e5e7eb";
  const surface = tokens["color.surface-raised"] ?? "#ffffff";
  const radius =
    tokens["radius.scale-preset"] === "sharp"
      ? 0
      : tokens["radius.scale-preset"] === "pillowy"
        ? 16
        : tokens["radius.scale-preset"] === "pill"
          ? 999
          : 10;
  const shadow =
    tokens["shadow.preset"] === "none"
      ? "none"
      : tokens["shadow.preset"] === "ambient"
        ? "0 18px 40px rgba(0,0,0,0.14)"
        : tokens["shadow.preset"] === "soft"
          ? "0 8px 24px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.12)";

  return (
    <div style={{ position: "sticky", top: 8 }}>
      <Legend>Live preview</Legend>
      <div
        style={{
          background: bg,
          border: `1px solid ${line}`,
          borderRadius: 12,
          padding: 18,
          color: ink,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 700, color: ink, lineHeight: 1.2 }}>Heading text</div>
        <div style={{ fontSize: 13, color: muted, lineHeight: 1.5 }}>
          A paragraph in the muted tone, showing body copy on the default canvas.
        </div>
        <button
          type="button"
          style={{
            alignSelf: "flex-start",
            background: accent,
            color: "#ffffff",
            border: "none",
            borderRadius: Math.min(radius, 24),
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "default",
          }}
        >
          Primary action
        </button>
        <div
          style={{
            background: surface,
            border: `1px solid ${line}`,
            borderRadius: Math.min(radius, 18),
            boxShadow: shadow,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>Card title</div>
          <div style={{ fontSize: 12, color: muted }}>Raised surface with the hairline border.</div>
        </div>
      </div>
    </div>
  );
}
