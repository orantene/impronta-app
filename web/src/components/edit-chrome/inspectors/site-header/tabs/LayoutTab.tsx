"use client";

/**
 * Layout tab — desktop-side composition of the header bar.
 *
 * Three token-driven decisions live here:
 *   - Header style       (shell.header-variant)
 *   - Nav alignment      (shell.header-nav-alignment)
 *   - CTA placement      (shell.header-cta-placement)
 *
 * Each control is a chip group with a mini-mockup so operators see what
 * they're picking before they pick it — that's the "visual decision-
 * making" rule from the Step 5 quality bar.
 *
 * All three controls write to theme_json via patchToken — the optimistic
 * `<html data-token-*>` mutation flips the live header instantly while
 * the autosave queue persists. No router.refresh().
 */

import { InspectorGroup } from "../../kit";
import { GroupDescription } from "../tab-helpers";
import {
  CtaPlacementThumb_Both,
  CtaPlacementThumb_Hidden,
  CtaPlacementThumb_InsideMenuOnly,
  CtaPlacementThumb_Right,
  HeaderVariantThumb_CenteredEditorial,
  HeaderVariantThumb_Classic,
  HeaderVariantThumb_EditorialSticky,
  HeaderVariantThumb_Espresso,
  HeaderVariantThumb_Minimal,
  NavAlignThumb_Center,
  NavAlignThumb_Left,
  NavAlignThumb_Right,
  NavAlignThumb_Split,
} from "../thumbnails";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";
import type { ComponentType } from "react";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

interface ChipDef<T extends string> {
  value: T;
  label: string;
  helper: string;
  Thumb: ComponentType;
}

const HEADER_VARIANT_OPTIONS: ChipDef<string>[] = [
  {
    value: "classic-solid",
    label: "Classic",
    helper: "Solid bar, traditional. Reliable default.",
    Thumb: HeaderVariantThumb_Classic,
  },
  {
    value: "editorial-sticky",
    label: "Editorial",
    helper: "Soft blur, ivory tone. Refined, content-first.",
    Thumb: HeaderVariantThumb_EditorialSticky,
  },
  {
    value: "espresso-column",
    label: "Espresso",
    helper: "Dark bar, light type. Moody, premium.",
    Thumb: HeaderVariantThumb_Espresso,
  },
  {
    value: "centered-editorial",
    label: "Centered",
    helper: "Logo center, nav split. Boutique, editorial.",
    Thumb: HeaderVariantThumb_CenteredEditorial,
  },
  {
    value: "minimal",
    label: "Minimal",
    helper: "Hairline border only. Maximum content focus.",
    Thumb: HeaderVariantThumb_Minimal,
  },
];

const NAV_ALIGN_OPTIONS: ChipDef<string>[] = [
  {
    value: "left",
    label: "Left",
    helper: "Nav next to the search icon. Default.",
    Thumb: NavAlignThumb_Left,
  },
  {
    value: "center",
    label: "Center",
    helper: "Nav fans out next to the centered brand.",
    Thumb: NavAlignThumb_Center,
  },
  {
    value: "right",
    label: "Right",
    helper: "Nav clusters before the utility icons on the right.",
    Thumb: NavAlignThumb_Right,
  },
  {
    value: "split-around-logo",
    label: "Split",
    helper: "Half on each side of the centered brand.",
    Thumb: NavAlignThumb_Split,
  },
];

const CTA_PLACEMENT_OPTIONS: ChipDef<string>[] = [
  {
    value: "right",
    label: "Right",
    helper: "Filled button on the right. The conventional CTA spot.",
    Thumb: CtaPlacementThumb_Right,
  },
  {
    value: "inside-menu-only",
    label: "Inside menu",
    helper: "CTA hidden in the bar; appears at the top of the mobile menu.",
    Thumb: CtaPlacementThumb_InsideMenuOnly,
  },
  {
    value: "both",
    label: "Both",
    helper: "Visible in the bar and inside the menu. Belt-and-braces.",
    Thumb: CtaPlacementThumb_Both,
  },
  {
    value: "hidden",
    label: "Hidden",
    helper: "Don’t show a CTA. Useful for editorial / portfolio sites.",
    Thumb: CtaPlacementThumb_Hidden,
  },
];

export function LayoutTab({ config, patch }: Props) {
  const variant =
    config.branding.themeJson["shell.header-variant"] ?? "classic-solid";
  const navAlign =
    config.branding.themeJson["shell.header-nav-alignment"] ?? "left";
  const ctaPlacement =
    config.branding.themeJson["shell.header-cta-placement"] ?? "right";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Header style">
        <GroupDescription>
          The overall visual treatment of the bar.
        </GroupDescription>
        <ChipGrid
          options={HEADER_VARIANT_OPTIONS}
          value={variant}
          onChange={(v) => patch.patchToken("shell.header-variant", v)}
          columns={2}
        />
      </InspectorGroup>

      <InspectorGroup title="Nav alignment">
        <GroupDescription>
          Where the inline links sit on desktop. Mobile keeps them inside the
          hamburger menu regardless of this choice.
        </GroupDescription>
        <ChipGrid
          options={NAV_ALIGN_OPTIONS}
          value={navAlign}
          onChange={(v) => patch.patchToken("shell.header-nav-alignment", v)}
          columns={2}
        />
      </InspectorGroup>

      <InspectorGroup title="CTA placement">
        <GroupDescription>
          Renders the brand’s primary call-to-action button. Picks up its label
          and link from Brand → Primary CTA.
        </GroupDescription>
        <ChipGrid
          options={CTA_PLACEMENT_OPTIONS}
          value={ctaPlacement}
          onChange={(v) => patch.patchToken("shell.header-cta-placement", v)}
          columns={2}
        />
        <CtaIdentityHint config={config} />
      </InspectorGroup>
    </div>
  );
}

function ChipGrid({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: ChipDef<string>[];
  value: string;
  onChange: (next: string) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid ${columns === 2 ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
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
  );
}

function CtaIdentityHint({ config }: { config: SiteHeaderConfig }) {
  const hasCta =
    Boolean(config.identity.primaryCtaLabel?.trim()) &&
    Boolean(config.identity.primaryCtaHref?.trim());

  if (hasCta) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50/60 px-2.5 py-2 text-[11px] text-emerald-800">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-500" />
        CTA set: <span className="font-semibold">{config.identity.primaryCtaLabel}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-2 text-[11px] text-stone-600">
      No CTA configured. Set one in the <span className="font-medium">Brand</span> tab
      (or under <span className="font-medium">Identity → Primary CTA</span>) and any
      placement other than “hidden” will surface it.
    </div>
  );
}
