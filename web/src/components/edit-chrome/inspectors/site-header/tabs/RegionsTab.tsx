"use client";

/**
 * WF-6 — the header LAYOUT tab: "everything is customisable, you can move the
 * nav, the logo, the CTA and the icons".
 *
 * The renderer for `regions` shipped in WF-5; until this tab, nothing wrote
 * the value, so the capability existed and was unreachable. This is the
 * writing surface: three zone lists (left / center / right), a palette of the
 * ten item kinds, per-item responsive behaviour, and the two one-way doors
 * (seed from the current preset, reset back to it).
 *
 * THREE THINGS THIS TAB DELIBERATELY DOES NOT DO
 *
 *   1. It does not invent a draft model. Every other tab in this inspector
 *      autosave-publishes through the same debounced bus; a "regions draft"
 *      that only this tab honoured would mean two different meanings for the
 *      word "saved" inside one drawer.
 *   2. It does not hide itself on Free. The owner's decision is that moving
 *      zones is paid, and a feature the operator cannot see is a feature they
 *      never upgrade for. The tab renders, locked, with the reason.
 *   3. It does not own the CONTENT. An item is a placement: removing the
 *      "Menu links" item takes the list out of the bar and leaves the links
 *      exactly where they were on the Navigation tab.
 */

import { useCallback, useEffect, useState } from "react";

import { InspectorGroup } from "../../kit";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "../../../kit";
import { useEditorLocale } from "../../../use-editor-locale";
import {
  HEADER_ZONES,
  STACKED_VARIANTS,
  seedRegionsFromVariant,
  type HeaderRegions,
  type HeaderZone,
} from "@/lib/site-admin/sections/site_header/regions-editing";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";
import { ZONE_META } from "./regions-meta";
import { Zone } from "./regions-zone";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

/** Matches the chrome's other armed-destructive timers. */
const DISARM_MS = 2600;

/** Social platforms the tenant has actually filled in, in identity order. */
const SOCIAL_FIELDS = [
  { platform: "instagram", key: "socialInstagram", label: "Instagram" },
  { platform: "tiktok", key: "socialTiktok", label: "TikTok" },
  { platform: "facebook", key: "socialFacebook", label: "Facebook" },
  { platform: "youtube", key: "socialYoutube", label: "YouTube" },
  { platform: "linkedin", key: "socialLinkedin", label: "LinkedIn" },
  { platform: "x", key: "socialX", label: "X (Twitter)" },
  { platform: "whatsapp", key: "whatsapp", label: "WhatsApp" },
] as const;

export function RegionsTab({ config, patch }: Props) {
  const { t } = useEditorLocale();
  const section = config.section;
  const regions = section?.regions ?? null;

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [paletteZone, setPaletteZone] = useState<HeaderZone | null>(null);

  // Armed destructive states disarm themselves, so a confirm the operator
  // walked away from cannot be completed by an unrelated later click.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), DISARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const commit = useCallback(
    (next: HeaderRegions | null) => {
      setOpenRow(null);
      setPaletteZone(null);
      patch.patchRegions(next);
    },
    [patch],
  );

  const availableSocial = SOCIAL_FIELDS.filter(
    (f) => !!config.identity[f.key],
  );

  // Plan lock FIRST, before the "no shell yet" notice. A Free workspace that
  // has not published a shell would otherwise be told to go publish one, and
  // only discover the feature is paid after doing the work.
  if (!config.canEditRegions) {
    return <LockedState variant={section?.variant ?? null} />;
  }

  if (!section) {
    return (
      <Notice
        title={t("This site has no shell header yet")}
        body={t(
          "Publish the site shell once and the header layout controls appear here.",
        )}
      />
    );
  }

  if (!regions) {
    return (
      <EmptyState
        variant={section.variant}
        onSeed={() =>
          commit(
            seedRegionsFromVariant({
              variant: section.variant,
              brandDisplay: section.brandDisplay,
              hasLogo:
                !!config.branding.logoMediaAssetId ||
                !!config.branding.brandMarkSvg,
              hasWordmark: !!config.identity.publicName,
              navItemCount: config.navigation.items.filter((i) => i.visible)
                .length,
              hasPrimaryCta:
                !!config.identity.primaryCtaLabel &&
                !!config.identity.primaryCtaHref,
              socialCount: availableSocial.length,
              hasPhone: !!config.identity.contactPhone,
              // The inspector cannot see the tenant's locale settings, and the
              // renderer already hides this item when there is only one active
              // language. Seeding it is therefore lossless, while omitting it
              // would silently drop the switcher for a bilingual tenant.
              showLanguage: true,
            }),
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Header layout"
        info="Drag an item to reorder it inside its zone, or open it to move it to another zone. Items point at content you manage on the other tabs, so removing one takes it out of the bar without deleting anything."
      >
        <div className="flex flex-col gap-3.5">
          {HEADER_ZONES.map((zone) => (
            <Zone
              key={zone}
              zone={zone}
              regions={regions}
              openRow={openRow}
              setOpenRow={setOpenRow}
              armed={armed}
              setArmed={setArmed}
              paletteOpen={paletteZone === zone}
              onTogglePalette={() =>
                setPaletteZone((z) => (z === zone ? null : zone))
              }
              onChange={commit}
              config={config}
              availableSocial={availableSocial}
            />
          ))}
        </div>
      </InspectorGroup>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] leading-snug" style={{ color: CHROME.muted }}>
          {t("Back to the preset layout for your header style.")}
        </span>
        <button
          type="button"
          onClick={() => {
            if (armed === "reset") {
              setArmed(null);
              commit(null);
            } else {
              setArmed("reset");
            }
          }}
          className="shrink-0 cursor-pointer text-[10.5px] font-semibold uppercase tracking-[0.10em]"
          style={
            armed === "reset"
              ? {
                  background: CHROME.roseBg,
                  border: `1px solid ${CHROME.roseLine}`,
                  color: CHROME.rose,
                  borderRadius: CHROME_RADII.xs,
                  padding: "3px 8px",
                }
              : {
                  background: "transparent",
                  border: "none",
                  color: CHROME.muted,
                  padding: 0,
                }
          }
        >
          {armed === "reset" ? t("Confirm reset") : t("Reset layout")}
        </button>
      </div>
    </div>
  );
}

// ── Empty / locked / notice states ──────────────────────────────────────────

function EmptyState({
  variant,
  onSeed,
}: {
  variant: string;
  onSeed: () => void;
}) {
  const { t } = useEditorLocale();
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-col gap-2 p-3.5"
        style={{
          background: CHROME.surface,
          border: `1px solid ${CHROME.line}`,
          borderRadius: CHROME_RADII.lg,
          boxShadow: CHROME_SHADOWS.card,
        }}
      >
        <span
          className="text-[12.5px] font-semibold"
          style={{ color: CHROME.text }}
        >
          {t("Your header uses a preset layout")}
        </span>
        <span
          className="text-[11.5px] leading-relaxed"
          style={{ color: CHROME.muted }}
        >
          {t(
            "Switch to a custom layout to move your logo, menu, buttons and icons between the left, middle and right of the bar. We start you off with a copy of what your header shows today, so nothing changes until you move something.",
          )}
        </span>
        {STACKED_VARIANTS.has(variant) ? (
          <span
            className="text-[11px] leading-relaxed"
            style={{ color: CHROME.muted }}
          >
            {t(
              "One thing to know: your current style puts the menu on its own row under the logo. A custom layout is a single row, so the menu moves up beside everything else.",
            )}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onSeed}
          className="mt-1 self-start rounded-md px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150"
          style={{ background: CHROME.accent }}
        >
          {t("Customize layout")}
        </button>
      </div>
    </div>
  );
}

function LockedState({ variant }: { variant: string | null }) {
  const { t } = useEditorLocale();
  return (
    <div
      className="flex flex-col gap-2 p-3.5"
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: CHROME_RADII.lg,
        boxShadow: CHROME_SHADOWS.card,
      }}
    >
      <span
        className="text-[12.5px] font-semibold"
        style={{ color: CHROME.text }}
      >
        {t("Custom header layout is a paid feature")}
      </span>
      <span
        className="text-[11.5px] leading-relaxed"
        style={{ color: CHROME.muted }}
      >
        {t(
          "Upgrade to Studio to move your logo, menu, buttons and icons between the left, middle and right of the bar. Your logo, links and button stay editable on the other tabs.",
        )}
      </span>
      <div
        aria-hidden
        className="mt-1 flex items-center gap-1 rounded-md px-2 py-2 opacity-45"
        style={{ background: "rgba(24, 24, 27, 0.03)" }}
      >
        {HEADER_ZONES.map((zone) => (
          <span
            key={zone}
            className="flex-1 rounded px-1.5 py-1 text-center text-[10px] font-medium"
            style={{ background: CHROME.surface, color: CHROME.muted }}
          >
            {t(ZONE_META[zone].label)}
          </span>
        ))}
      </div>
      {variant ? (
        <span className="text-[10.5px]" style={{ color: CHROME.muted3 }}>
          {t("Current style")}: {variant}
        </span>
      ) : null}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 p-3.5"
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: CHROME_RADII.lg,
      }}
    >
      <span
        className="text-[12.5px] font-semibold"
        style={{ color: CHROME.text }}
      >
        {title}
      </span>
      <span className="text-[11.5px] leading-relaxed" style={{ color: CHROME.muted }}>
        {body}
      </span>
    </div>
  );
}
