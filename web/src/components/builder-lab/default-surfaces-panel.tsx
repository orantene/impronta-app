"use client";

/**
 * DefaultSurfacesPanel (Builder Lab → Default surfaces) — the super-admin manager
 * for the PLATFORM DEFAULT storefront + talent profile.
 *
 * These pointers are LOAD-BEARING: the render path reads them on every
 * unconfigured agency homepage (the DEFAULT storefront) and every fallback
 * talent (no published Max site). A super-admin can:
 *   - point each DEFAULT surface at any PUBLISHED page template (or reset to the
 *     built-in default — clearing the pointer falls back to the reserved slug),
 *   - preview the active default via the Wave-1 `/dev/template-preview` harness,
 *   - toggle the talent freeform default (without a deploy; OR-ed with the legacy
 *     `DEFAULT_TALENT_FREEFORM_PROFILE` env flag).
 *
 * Mirrors `SiteDefaultsEditor`'s structure: a `SurfaceSwitcher`, a per-surface
 * action set, `useTransition` + status feedback. Save IS apply (the singleton
 * has no draft layer). Pointers persist to `platform_settings` via the
 * super-admin-gated actions in `admin-platform-default-templates.ts`.
 */

import { useEffect, useState, useTransition } from "react";

import {
  loadPlatformDefaultTemplatesAction,
  savePlatformDefaultTemplatePointerAction,
  savePlatformDefaultTalentFreeformAction,
  type DefaultSurfaceTemplateOption,
} from "@/lib/server-actions/admin-platform-default-templates";
import type { PlatformTemplateSurface } from "@/lib/platform/default-templates";
import { SurfaceSwitcher } from "./surface-switcher";
import { LAB as T, RADII, fieldStyle, LabButton, SectionLabel } from "./ui";

// Which DEFAULT surface the operator is managing. "storefront" = the agency
// homepage default (every unconfigured agency homepage); "talent" = the fallback
// talent profile (any talent with no published Max site).
const SURFACE_TABS: ReadonlyArray<{
  key: PlatformTemplateSurface;
  label: string;
  blurb: string;
  previewKey: string;
}> = [
  {
    key: "storefront",
    label: "Default Storefront",
    blurb:
      "The agency homepage rendered for any workspace that has NOT published its own composition.",
    previewKey: "default-storefront",
  },
  {
    key: "talent",
    label: "Default Talent Profile",
    blurb:
      "The fallback profile rendered for any talent without a published Max site (when the freeform default is on).",
    previewKey: "default-talent",
  },
];

/** Sentinel select value for "Use built-in default" (clears the pointer). */
const BUILT_IN = "__built_in__";

export function DefaultSurfacesPanel() {
  const [surface, setSurface] = useState<PlatformTemplateSurface>("storefront");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<DefaultSurfaceTemplateOption[]>([]);
  const [pointerId, setPointerId] = useState<string | null>(null);
  const [freeformEnabled, setFreeformEnabled] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  // Reload the pointers + published-template options whenever the surface flips.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStatus(null);
    void loadPlatformDefaultTemplatesAction(surface).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setOptions(r.options);
        setPointerId(
          surface === "talent"
            ? r.pointers.talentTemplateId
            : r.pointers.storefrontTemplateId,
        );
        setFreeformEnabled(r.pointers.talentFreeformEnabled);
        setLoadError(null);
      } else {
        setLoadError(r.error);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [surface]);

  const activeTab = SURFACE_TABS.find((t) => t.key === surface);
  const activeOption = options.find((o) => o.id === pointerId) ?? null;

  const onSelectTemplate = (value: string) => {
    const nextId = value === BUILT_IN ? null : value;
    setStatus(null);
    startTransition(async () => {
      const r = await savePlatformDefaultTemplatePointerAction({
        surface,
        templateId: nextId,
      });
      if (r.ok) {
        setPointerId(nextId);
        setStatus({
          ok: true,
          msg: nextId
            ? "Saved — this template is now the default for this surface."
            : "Reset — this surface now uses the built-in default.",
        });
      } else {
        setStatus({ ok: false, msg: `Failed: ${r.error}` });
      }
    });
  };

  const toggleFreeform = () => {
    const next = !freeformEnabled;
    setStatus(null);
    startTransition(async () => {
      const r = await savePlatformDefaultTalentFreeformAction({ enabled: next });
      if (r.ok) {
        setFreeformEnabled(next);
        setStatus({
          ok: true,
          msg: next
            ? "Freeform default ON — talents without a published Max site now render the freeform default."
            : "Freeform default OFF — those talents render the classic profile layout.",
        });
      } else {
        setStatus({ ok: false, msg: `Failed: ${r.error}` });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Surface toggle — Default Storefront vs Default Talent Profile */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SurfaceSwitcher
          options={SURFACE_TABS}
          value={surface}
          onChange={setSurface}
          ariaLabel="Default surface"
        />
        {activeTab ? (
          <div style={{ fontSize: 12, color: T.inkMuted }}>{activeTab.blurb}</div>
        ) : null}
      </div>

      {loading ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "12px 0" }}>
          Loading default surfaces…
        </div>
      ) : loadError ? (
        <div style={{ color: T.red, fontSize: 13, padding: "12px 0" }}>
          {loadError}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
          {/* ── Template pointer ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionLabel>Default template</SectionLabel>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, color: T.inkMuted }}>
                Published page template
              </span>
              <select
                value={pointerId ?? BUILT_IN}
                disabled={pending}
                onChange={(e) => onSelectTemplate(e.target.value)}
                style={{ ...fieldStyle, padding: "8px 10px", borderRadius: RADII.control }}
              >
                <option value={BUILT_IN}>Use built-in default</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} ({o.slug})
                  </option>
                ))}
              </select>
            </label>
            <div style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5 }}>
              {activeOption ? (
                <>
                  Active pointer:{" "}
                  <span style={{ color: T.ink, fontWeight: 600 }}>
                    {activeOption.title}
                  </span>
                  . Render order: this template → reserved slug → built-in.
                </>
              ) : (
                <>
                  Using the <span style={{ color: T.ink, fontWeight: 600 }}>built-in default</span>{" "}
                  (the reserved-slug template, then the code fallback). No pointer set.
                </>
              )}
            </div>
            {options.length === 0 ? (
              <div style={{ fontSize: 11.5, color: T.inkDim }}>
                No published page templates for this surface yet — publish one in the
                registry to point a default at it.
              </div>
            ) : null}
          </section>

          {/* ── Preview ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Preview</SectionLabel>
            <a
              href={`/dev/template-preview/${activeTab?.previewKey ?? "default-storefront"}`}
              target="_blank"
              rel="noreferrer"
              style={{
                alignSelf: "flex-start",
                fontSize: 12.5,
                fontWeight: 600,
                color: T.accent,
                textDecoration: "none",
                border: `1px solid ${T.accent}`,
                background: T.accentSoft,
                borderRadius: RADII.control,
                padding: "7px 13px",
              }}
            >
              Open built-in {activeTab?.label.toLowerCase()} preview ↗
            </a>
            <div style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5 }}>
              The harness renders the built-in default tree. A pointer / reserved-slug
              template is reflected on the live default surface.
            </div>
          </section>

          {/* ── Talent freeform toggle (talent surface only) ── */}
          {surface === "talent" ? (
            <section
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                borderTop: `1px solid ${T.borderSoft}`,
                paddingTop: 18,
              }}
            >
              <SectionLabel>Freeform default profile</SectionLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={freeformEnabled}
                  disabled={pending}
                  onClick={toggleFreeform}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                  style={{
                    position: "relative",
                    width: 44,
                    height: 24,
                    borderRadius: 999,
                    border: `1px solid ${freeformEnabled ? T.accent : T.border}`,
                    background: freeformEnabled ? T.accentBg : T.cardSoft,
                    cursor: pending ? "default" : "pointer",
                    opacity: pending ? 0.6 : 1,
                    flexShrink: 0,
                    transition: "background 120ms ease",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: freeformEnabled ? 22 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: freeformEnabled ? T.accent : T.inkDim,
                      transition: "left 120ms ease",
                    }}
                  />
                </button>
                <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 600 }}>
                  {freeformEnabled ? "On" : "Off"}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5 }}>
                When on, talents without a published Max site render the freeform default
                profile. When off, they render the classic profile layout. This is OR-ed
                with the legacy <code>DEFAULT_TALENT_FREEFORM_PROFILE</code> env flag, so an
                env-enabled deploy stays on even with this toggle off.
              </div>
            </section>
          ) : null}

          {status ? (
            <div
              style={{
                fontSize: 12.5,
                color: status.ok ? T.accent : T.red,
              }}
            >
              {status.msg}
            </div>
          ) : null}

          {pending ? (
            <div style={{ fontSize: 11.5, color: T.inkMuted }}>Saving…</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
