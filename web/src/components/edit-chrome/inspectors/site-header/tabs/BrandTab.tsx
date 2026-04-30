"use client";

/**
 * Brand tab — the WHO of the header bar.
 *
 * Holds everything an operator thinks of as "this is my brand":
 *   - Identity (label, tagline, primary CTA inputs live here too)
 *   - Logo
 *   - Brand layout (mark + text lockup style)
 *   - Brand colors (primary, accent — the brand palette)
 *   - Typography preset
 *
 * 2026-04-30 IA pass — these used to be split between Brand and a
 * separate "Style" tab, which forced operators to tab-hop while
 * editing one logical concept ("what does my brand look like?").
 * Colors live HERE because they're brand-level decisions; surface
 * colors (header bg/text/border) live in Layout because they're
 * about the bar, not the brand.
 *
 * Visual contract (matches CTA Banner / Hero inspectors):
 *   InspectorGroup → KIT.field → KIT.label + KIT.input. No bespoke
 *   group chrome. Helper microcopy lives in the InspectorGroup info-tip
 *   so the field surface stays calm.
 */

import { useEffect, useState } from "react";

import { InspectorGroup, KIT } from "../../kit";
import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";
import {
  BrandLayoutThumb_Inline,
  BrandLayoutThumb_LogoOnly,
  BrandLayoutThumb_Stacked,
  BrandLayoutThumb_TextOnly,
  BrandPositionThumb_Center,
  BrandPositionThumb_Left,
  BrandPositionThumb_Right,
} from "../thumbnails";
import { ColorRow } from "../shared/ColorRow";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
  tenantId: string;
}

const POSITION_OPTIONS = [
  {
    value: "left" as const,
    label: "Left",
    helper: "Brand on the left, nav and CTA flow rightward. Classic editorial.",
    Thumb: BrandPositionThumb_Left,
  },
  {
    value: "center" as const,
    label: "Center",
    helper: "Centered brand. Reads as boutique / fashion-forward.",
    Thumb: BrandPositionThumb_Center,
  },
  {
    value: "right" as const,
    label: "Right",
    helper: "Brand on the right. Rare; for type-forward studios with a strong wordmark.",
    Thumb: BrandPositionThumb_Right,
  },
];

const LAYOUT_OPTIONS = [
  {
    value: "inline" as const,
    label: "Inline",
    helper: "Mark + text on one line. The classic header lockup.",
    Thumb: BrandLayoutThumb_Inline,
  },
  {
    value: "stacked" as const,
    label: "Stacked",
    helper: "Mark above text. Editorial feel; reads like a wordmark.",
    Thumb: BrandLayoutThumb_Stacked,
  },
  {
    value: "logo-only" as const,
    label: "Logo only",
    helper: "Hide the text. For brands with a strong recognizable mark.",
    Thumb: BrandLayoutThumb_LogoOnly,
  },
  {
    value: "text-only" as const,
    label: "Text only",
    helper: "Hide the mark. Clean type-forward header.",
    Thumb: BrandLayoutThumb_TextOnly,
  },
];

export function BrandTab({ config, patch, tenantId }: Props) {
  const layout =
    config.branding.themeJson["shell.header-brand-layout"] ?? "inline";
  const position =
    config.branding.themeJson["shell.header-brand-position"] ?? "left";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Brand text"
        info="Shown in the header bar, tabs, browser title, and OpenGraph defaults."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Brand label</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="e.g. Impronta"
            maxLength={120}
            value={config.identity.publicName}
            onChange={(e) => patch.patchIdentity({ publicName: e.target.value })}
          />
        </div>

        <div className={KIT.field}>
          <label className={KIT.label}>Tagline</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Optional — e.g. Models & image agency"
            maxLength={160}
            value={config.identity.tagline ?? ""}
            onChange={(e) =>
              patch.patchIdentity({ tagline: e.target.value || null })
            }
          />
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Logo"
        info="Square mark, 60×60 minimum. SVG preferred so it stays crisp on retina."
      >
        <LogoField
          tenantId={tenantId}
          currentAssetId={config.branding.logoMediaAssetId}
          onChange={(id) => patch.patchBranding({ logoMediaAssetId: id })}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Brand position"
        info="Where the brand anchors in the header bar. Independent of the lockup style below."
      >
        <div className="grid grid-cols-3 gap-2">
          {POSITION_OPTIONS.map((opt) => {
            const active = position === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  patch.patchToken("shell.header-brand-position", opt.value)
                }
                title={`${opt.label} — ${opt.helper}`}
                aria-label={opt.label}
                className={`group flex flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-transparent bg-[#faf9f6] hover:border-[#e5e0d5] hover:bg-white"
                }`}
              >
                <span className="flex items-center justify-center rounded-md bg-white py-1.5">
                  <opt.Thumb />
                </span>
                <span
                  className={`px-0.5 text-[11.5px] font-medium ${active ? "text-indigo-700" : "text-stone-700"}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Brand layout"
        info="How the mark and text sit together in the header."
      >
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = layout === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  patch.patchToken("shell.header-brand-layout", opt.value)
                }
                title={`${opt.label} — ${opt.helper}`}
                aria-label={opt.label}
                className={`group flex flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-transparent bg-[#faf9f6] hover:border-[#e5e0d5] hover:bg-white"
                }`}
              >
                <span className="flex items-center justify-center rounded-md bg-white py-1.5">
                  <opt.Thumb />
                </span>
                <span
                  className={`px-0.5 text-[11.5px] font-medium ${active ? "text-indigo-700" : "text-stone-700"}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Brand colors"
        info="Primary drives the CTA button + active states across the site. Accent is the gold/highlight register — small chips, link underlines, dividers."
      >
        <ColorRow
          label="Primary"
          hint="The CTA button and active selection."
          value={config.branding.primaryColor ?? ""}
          onChange={(hex) =>
            patch.patchBranding({ primaryColor: hex || null })
          }
        />
        <div className="h-2" />
        <ColorRow
          label="Accent"
          hint="Secondary highlight — gold-line dividers, link underlines."
          value={config.branding.accentColor ?? ""}
          onChange={(hex) =>
            patch.patchBranding({ accentColor: hex || null })
          }
        />
      </InspectorGroup>

      <InspectorGroup
        title="Typography"
        info="The brand's font preset. Header type follows it; full Google Fonts picker is one click away in design settings."
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2.5 transition-[border-color] duration-150 hover:border-[#e5e0d5]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400">
              Current preset
            </span>
            <span className="text-[13px] font-semibold text-stone-800">
              {config.branding.fontPreset || "default"}
            </span>
          </div>
          <a
            href="/admin/site-settings/design"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] font-medium text-indigo-600 transition-colors hover:text-indigo-800"
          >
            Change in design →
          </a>
        </div>
      </InspectorGroup>
    </div>
  );
}

function LogoField({
  currentAssetId,
  onChange,
  tenantId,
}: {
  currentAssetId: string | null;
  onChange: (id: string | null) => void;
  tenantId: string;
}) {
  // Resolve the asset id → public URL so we can render a thumbnail.
  // Same /api/admin/media/library endpoint the picker uses.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!currentAssetId) {
      setPreviewUrl(null);
      return;
    }
    setResolving(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/media/library?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.ok && Array.isArray(body.items)) {
          const found = body.items.find(
            (m: { id: string; publicUrl: string }) => m.id === currentAssetId,
          );
          setPreviewUrl(found?.publicUrl ?? null);
        }
      } catch {
        // Silent — preview is a nice-to-have, not load-blocking.
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAssetId, tenantId]);

  const hasLogo = Boolean(currentAssetId && previewUrl);

  // 2027-style hover-edit pattern: the entire thumbnail IS the trigger.
  // No status text, no separate Pick / Replace / Clear button row. The
  // MediaPicker's own button is positioned `absolute inset-0` and made
  // invisible (opacity-0); a CSS hover overlay surfaces "Replace" /
  // "Add logo" microcopy contextually. Clear (×) appears top-right
  // only when a logo is set, only on hover.
  return (
    <div className="group relative size-24 overflow-hidden rounded-lg border border-[#e5e0d5] bg-[#faf9f6] transition-[border-color] duration-150 hover:border-stone-300">
      {/* Thumbnail layer */}
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl!}
            alt="Current logo"
            className="size-full object-contain p-2"
          />
        ) : resolving ? (
          <span className="size-3 animate-pulse rounded-full bg-stone-300" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-stone-300"
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        )}
      </div>

      {/* Hover overlay — fades in on group-hover. Pure CSS, no JS state. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-stone-900/60 text-white opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover:opacity-100">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {hasLogo ? (
            <>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </>
          ) : (
            <>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </>
          )}
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
          {hasLogo ? "Replace" : "Add logo"}
        </span>
      </div>

      {/* MediaPicker trigger — covers the whole tile, invisible. The
       * arbitrary-selector `[&>button]` targets the button MediaPicker
       * renders, sizes it to the tile, and zeroes its visual chrome. */}
      <div className="absolute inset-0 z-20 [&>button]:absolute [&>button]:inset-0 [&>button]:size-full [&>button]:cursor-pointer [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-transparent [&>button]:opacity-0">
        <MediaPicker
          tenantId={tenantId}
          label="."
          onPick={() => {
            // Single-pick by URL is unused — onPickItem delivers the asset id.
          }}
          onPickItem={(item) => onChange(item.id)}
        />
      </div>

      {/* Clear (×) — only when a logo is set; only on hover. Stops
       * propagation so it doesn't trigger the picker behind it. */}
      {currentAssetId ? (
        <button
          type="button"
          aria-label="Clear logo"
          title="Clear logo"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          className="absolute right-1.5 top-1.5 z-30 inline-flex size-5 items-center justify-center rounded-full bg-stone-900/85 text-white opacity-0 shadow-md transition-opacity duration-200 hover:bg-rose-600 group-hover:opacity-100"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
