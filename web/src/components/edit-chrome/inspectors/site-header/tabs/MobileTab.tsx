"use client";

/**
 * Mobile tab — first-class mobile-side composition.
 *
 * Mobile is intentionally separate from Layout — operators don't think
 * "desktop minus stuff", they think "what does the menu look like, where
 * does the CTA go, how does the bar collapse". This tab answers those.
 *
 * In this first cut we ship two functional controls + IA stubs for the
 * three controls that need design judgment in the next session.
 */

import { InspectorGroup } from "../../kit";
import {
  CtaPlacementThumb_Both,
  CtaPlacementThumb_Hidden,
  CtaPlacementThumb_InsideMenuOnly,
  CtaPlacementThumb_Right,
  MobileNavThumb_DrawerRight,
  MobileNavThumb_FullScreen,
  MobileNavThumb_SheetBottom,
} from "../thumbnails";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";
import type { ComponentType } from "react";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

const MOBILE_NAV_OPTIONS: Array<{
  value: string;
  label: string;
  helper: string;
  Thumb: ComponentType;
}> = [
  {
    value: "drawer-right",
    label: "Drawer right",
    helper: "Slides in from the right. Classic mobile pattern.",
    Thumb: MobileNavThumb_DrawerRight,
  },
  {
    value: "sheet-bottom",
    label: "Sheet bottom",
    helper: "Slides up from below. Modern app feel.",
    Thumb: MobileNavThumb_SheetBottom,
  },
  {
    value: "full-screen-fade",
    label: "Full-screen",
    helper: "Covers the page. Editorial, immersive.",
    Thumb: MobileNavThumb_FullScreen,
  },
];

const MOBILE_CTA_OPTIONS: Array<{
  value: string;
  label: string;
  helper: string;
  Thumb: ComponentType;
}> = [
  {
    value: "outside",
    label: "In bar",
    helper: "CTA stays visible in the mobile top bar.",
    Thumb: CtaPlacementThumb_Right,
  },
  {
    value: "inside",
    label: "Inside menu",
    helper: "CTA only inside the hamburger menu.",
    Thumb: CtaPlacementThumb_InsideMenuOnly,
  },
  {
    value: "both",
    label: "Both",
    helper: "Visible in the bar and in the menu.",
    Thumb: CtaPlacementThumb_Both,
  },
  {
    value: "hidden",
    label: "Hidden",
    helper: "Don't show a CTA on mobile.",
    Thumb: CtaPlacementThumb_Hidden,
  },
];

export function MobileTab({ config, patch }: Props) {
  const navVariant =
    config.branding.themeJson["shell.mobile-nav-variant"] ?? "drawer-right";
  const ctaPlacement =
    config.branding.themeJson["shell.header-mobile-cta-placement"] ?? "outside";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Mobile menu style"
        info="How the navigation reveals when a visitor taps the hamburger."
      >
        <ChipGrid
          options={MOBILE_NAV_OPTIONS}
          value={navVariant}
          onChange={(v) => patch.patchToken("shell.mobile-nav-variant", v)}
          columns={3}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Mobile CTA placement"
        info="Mobile-specific override of the desktop CTA decision."
      >
        <ChipGrid
          options={MOBILE_CTA_OPTIONS}
          value={ctaPlacement}
          onChange={(v) =>
            patch.patchToken("shell.header-mobile-cta-placement", v)
          }
          columns={2}
        />
      </InspectorGroup>
    </div>
  );
}

function ChipGrid({
  options,
  value,
  onChange,
  columns,
}: {
  options: Array<{
    value: string;
    label: string;
    helper: string;
    Thumb: ComponentType;
  }>;
  value: string;
  onChange: (next: string) => void;
  columns: 2 | 3;
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
  );
}

