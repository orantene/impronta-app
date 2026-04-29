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

import { InspectorGroup, KIT } from "../../kit";
import { GroupDescription } from "../tab-helpers";
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

export function BrandTab({ config, patch }: Props) {
  const layout = config.branding.themeJson["shell.header-brand-layout"] ?? "inline";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Brand text">
        <GroupDescription>
          Shown in the header bar, tabs, browser title, and OpenGraph defaults.
        </GroupDescription>
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

      <InspectorGroup title="Logo">
        <GroupDescription>
          Square mark, 60×60 minimum. SVG preferred so it stays crisp on retina.
        </GroupDescription>
        <LogoField
          currentAssetId={config.branding.logoMediaAssetId}
          onChange={(id) => patch.patchBranding({ logoMediaAssetId: id })}
        />
      </InspectorGroup>

      <InspectorGroup title="Brand layout">
        <GroupDescription>
          How the mark and text sit together in the header.
        </GroupDescription>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = layout === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch.patchToken("shell.header-brand-layout", opt.value)}
                className={`group flex flex-col items-stretch gap-2 rounded-lg border p-2.5 text-left transition ${
                  active
                    ? "border-indigo-300 bg-indigo-50/40 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                    : "border-[#e5e0d5] bg-[#faf9f6] hover:border-stone-300 hover:bg-white"
                }`}
              >
                <span className="flex items-center justify-center rounded-md bg-white py-1.5">
                  <opt.Thumb />
                </span>
                <span className="flex flex-col gap-0.5 px-0.5">
                  <span
                    className={`text-[12px] font-semibold ${active ? "text-indigo-700" : "text-stone-700"}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[10.5px] leading-snug text-stone-500">
                    {opt.helper}
                  </span>
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
  onChange: _onChange,
}: {
  currentAssetId: string | null;
  onChange: (id: string | null) => void;
}) {
  // The full logo upload UX (media library + asset-id round-trip) lands
  // in the next pass — it requires media_assets pipeline integration
  // that's deeper than this tab's scope. For now we show the current
  // logo state and route operators to the existing admin form, where
  // the upload already works.
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3">
        {currentAssetId ? (
          <div className="flex items-center gap-2.5 text-[12px] text-stone-700">
            <span
              aria-hidden
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-400"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </span>
            <span className="flex flex-col">
              <span className="font-medium">Logo set</span>
              <span className="text-[10.5px] text-stone-400">
                Asset id <span className="font-mono">{currentAssetId.slice(0, 8)}…</span>
              </span>
            </span>
          </div>
        ) : (
          <div className="text-[12px] text-stone-500">
            No logo set — the brand text alone will appear in the header.
          </div>
        )}
      </div>
      <a
        href="/admin/site-settings/branding"
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-[11px] font-medium text-indigo-600 transition-colors hover:text-indigo-800"
      >
        Upload / replace logo →
      </a>
      <p className="text-[10.5px] leading-snug text-stone-400">
        Inline upload moves into this drawer in the next pass. For now,
        edit in the branding settings — changes appear here on next load.
      </p>
    </div>
  );
}
