"use client";

/**
 * Brand tab — Step 5b reference implementation.
 *
 * What this tab covers:
 *   - Brand text label (writes identity.public_name)
 *   - Tagline (writes identity.tagline)
 *   - Logo (writes branding.logo_media_asset_id via existing MediaPicker)
 *   - Brand layout (writes shell.header-brand-layout token; optimistic)
 *
 * Why it exists in this shape:
 *   These four fields are what an operator thinks of as "the brand
 *   block". They sit together because they're judged together — the
 *   operator switches between Inline / Stacked / Logo-only by looking
 *   at all of them at once.
 *
 * Quality bar (Step 5 instruction): visual chips for layout, calm
 * spacing, helper microcopy that explains WHEN to pick each option,
 * not just WHAT it does. Reuses the unified KIT.input system from the
 * inspector kit so the inputs match every other drawer in the editor.
 */

import { useEffect, useState } from "react";

import { InspectorGroup, KIT } from "../../kit";
import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";
import {
  BrandLayoutThumb_Inline,
  BrandLayoutThumb_LogoOnly,
  BrandLayoutThumb_Stacked,
  BrandLayoutThumb_TextOnly,
} from "../thumbnails";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
  tenantId: string;
}

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
  const layout = config.branding.themeJson["shell.header-brand-layout"] ?? "inline";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Brand text"
        info="Shown in the header bar, tabs, browser title, and OpenGraph defaults."
      >
        <FieldLabel hint="The name visitors see at the top of the page.">
          Brand label
        </FieldLabel>
        <input
          type="text"
          className={KIT.input}
          placeholder="e.g. Impronta"
          maxLength={120}
          value={config.identity.publicName}
          onChange={(e) => patch.patchIdentity({ publicName: e.target.value })}
        />

        <div className="h-2" />

        <FieldLabel hint="One short line under the brand. Optional. Often skipped on minimal sites.">
          Tagline
        </FieldLabel>
        <input
          type="text"
          className={KIT.input}
          placeholder="Optional — e.g. Models &amp; image agency"
          maxLength={160}
          value={config.identity.tagline ?? ""}
          onChange={(e) =>
            patch.patchIdentity({ tagline: e.target.value || null })
          }
        />
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
                onClick={() => patch.patchToken("shell.header-brand-layout", opt.value)}
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
    </div>
  );
}

function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex flex-col gap-0.5">
      <span className={KIT.label}>{children}</span>
      {hint ? <span className={KIT.hint}>{hint}</span> : null}
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
  // Hits the same /api/admin/media/library endpoint the picker uses;
  // cached on the client so picking + landing at the same URL stays
  // snappy.
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
            (m: { id: string; publicUrl: string }) =>
              m.id === currentAssetId,
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

  return (
    <div className="flex flex-col gap-2">
      {/* Preview tile — shows the logo if one is set, or an empty state
       *  with the same dimensions so the layout doesn't jump. */}
      <div className="flex items-center gap-3 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3">
        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-white">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl!}
              alt="Current logo"
              className="size-full object-contain p-1"
            />
          ) : resolving ? (
            <span className="size-3 animate-pulse rounded-full bg-stone-300" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
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
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-700">
            {hasLogo ? "Logo set" : "No logo yet"}
          </span>
          <span className="text-[10.5px] leading-snug text-stone-400">
            {hasLogo
              ? "Tap below to replace, or clear to fall back to the brand text."
              : "Upload an SVG or PNG — square or near-square works best."}
          </span>
        </div>
      </div>

      {/* Picker + clear actions */}
      <div className="flex items-center gap-2">
        <MediaPicker
          tenantId={tenantId}
          label={hasLogo ? "Replace logo" : "Pick or upload"}
          onPick={() => {
            // Single-pick by URL is unused here — onPickItem below
            // delivers the asset id we need for branding.
          }}
          onPickItem={(item) => onChange(item.id)}
        />
        {currentAssetId ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg border border-[#e5e0d5] bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500 transition hover:border-rose-200 hover:text-rose-600"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
