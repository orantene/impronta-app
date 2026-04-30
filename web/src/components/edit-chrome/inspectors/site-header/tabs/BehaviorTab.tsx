"use client";

/**
 * Behavior tab — scroll + sticky decisions.
 *
 * Two functional toggles in this first cut:
 *   - shell.header-sticky          (on / off)
 *   - shell.header-transparent-on-hero  (on / off)
 *
 * The over-hero scroll threshold is a future control — right now the
 * <PublicHeaderOverHeroSensor> hardcodes 80px which is sensible for
 * 90% of layouts. We'll surface the override when an operator
 * actually hits a case where it matters.
 */

import { InspectorGroup } from "../../kit";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

export function BehaviorTab({ config, patch }: Props) {
  const sticky = config.branding.themeJson["shell.header-sticky"] ?? "on";
  const transparent =
    config.branding.themeJson["shell.header-transparent-on-hero"] ?? "off";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Sticky"
        info="Whether the header stays pinned to the top as the visitor scrolls."
      >
        <ToggleRow
          label="Pin header to viewport"
          hint="On keeps the bar accessible while reading."
          checked={sticky === "on"}
          onChange={(v) =>
            patch.patchToken("shell.header-sticky", v ? "on" : "off")
          }
        />
      </InspectorGroup>

      <InspectorGroup
        title="Transparent over hero"
        info="Header reads transparent over the first hero section, turns solid as the visitor scrolls past it. Works best with full-bleed heroes."
      >
        <ToggleRow
          label="Transparent on hero, solid on scroll"
          hint="Pairs with full-bleed hero images."
          checked={transparent === "on"}
          onChange={(v) =>
            patch.patchToken(
              "shell.header-transparent-on-hero",
              v ? "on" : "off",
            )
          }
        />
      </InspectorGroup>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2.5 transition-[border-color,background-color] duration-150 hover:border-[#e5e0d5] hover:bg-white">
      <span className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium text-stone-800">{label}</span>
        {hint ? (
          <span className="text-[10.5px] leading-snug text-stone-500">{hint}</span>
        ) : null}
      </span>
      <span
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border transition ${
          checked
            ? "border-indigo-400 bg-indigo-500 text-white"
            : "border-stone-300 bg-white text-stone-400"
        }`}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        {checked ? (
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 8 3 3 7-7" />
          </svg>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

