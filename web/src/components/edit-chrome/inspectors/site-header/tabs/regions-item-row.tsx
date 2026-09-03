"use client";

/**
 * WF-6 — one row in a header zone, and the settings panel it opens.
 *
 * A row shows WHAT the item is (glyph + plain-language name) and WHAT IT WILL
 * RENDER right now (the summary line, read from the tenant's real content), so
 * an operator can tell "Main button" that has no wording yet from one that
 * does without opening it. The settings panel underneath owns the three
 * decisions the schema supports per item: where it sits, how it behaves at
 * each screen size, and who gives way when the bar runs out of room.
 *
 * Split out of `RegionsTab.tsx` for the 800-line `max-lines` cap; see
 * `regions-controls.tsx` for the note on how the four modules divide.
 */

import { CHROME, CHROME_RADII } from "../../../kit";
import { SelectField } from "../../kit/inspector-fields";
import {
  headerVerbHref,
  headerVerbPickerModel,
  verbNeedsCustomHref,
} from "@/lib/words/header-verb-options";
import type { HeaderVerb } from "@/lib/words";
import { useEditorLocale } from "../../../use-editor-locale";
import {
  HEADER_ZONES,
  type HeaderZone,
} from "@/lib/site-admin/sections/site_header/regions-editing";
import type { HeaderItem } from "@/lib/site-admin/sections/site_header/schema";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { DragHandleProps } from "../../kit";
import {
  BEHAVIOUR_OPTIONS,
  BREAKPOINT_ROWS,
  ITEM_META,
  ItemGlyph,
  PRIORITY_TIERS,
  ZONE_META,
  priorityNumberFor,
  priorityTierOf,
} from "./regions-meta";
import { ArrowGlyph, CloseGlyph, ChevronGlyph, DragGlyph, IconButton, TextRow } from "./regions-controls";
import type { HeaderItemKind } from "@/lib/site-admin/sections/site_header/regions-editing";

export interface ItemRowProps {
  item: HeaderItem;
  zone: HeaderZone;
  index: number;
  count: number;
  handleProps: DragHandleProps;
  open: boolean;
  onToggle: () => void;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
  onNudge: (dir: -1 | 1) => void;
  onMoveZone: (zone: HeaderZone) => void;
  onUpdate: (next: HeaderItem) => void;
  config: SiteHeaderConfig;
  availableSocial: ReadonlyArray<{ platform: string; label: string }>;
}

export function ItemRow(props: ItemRowProps) {
  const { t } = useEditorLocale();
  const { item, open, handleProps, onToggle, index, count } = props;
  const meta = ITEM_META[item.type as HeaderItemKind];

  return (
    <div
      className="rounded-md"
      style={{
        background: open ? "rgba(24, 24, 27, 0.03)" : "transparent",
      }}
    >
      <div className="group/row flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors duration-150 hover:bg-white">
        <button
          type="button"
          aria-label={t("Drag to reorder")}
          title={t("Drag to reorder")}
          {...handleProps}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
          style={{ color: CHROME.muted }}
        >
          <DragGlyph />
        </button>
        <span className="shrink-0" style={{ color: CHROME.muted }}>
          <ItemGlyph kind={item.type as HeaderItemKind} />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <span
            className="truncate text-[12px] font-medium"
            style={{ color: CHROME.text }}
          >
            {t(meta.label)}
          </span>
          <span
            className="truncate text-[10.5px]"
            style={{ color: CHROME.muted }}
          >
            <ItemSummary {...props} />
          </span>
        </button>
        <span
          className="shrink-0 text-[10px] tabular-nums"
          style={{ color: CHROME.muted3 }}
        >
          {index + 1}/{count}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? t("Close settings") : t("Open settings")}
          className="flex size-6 shrink-0 items-center justify-center rounded transition-transform duration-150"
          style={{
            color: CHROME.muted,
            transform: open ? "rotate(180deg)" : undefined,
          }}
        >
          <ChevronGlyph />
        </button>
      </div>
      {open ? <ItemSettings {...props} /> : null}
    </div>
  );
}

function ItemSummary({
  item,
  config,
  availableSocial,
}: Pick<ItemRowProps, "item" | "config" | "availableSocial">) {
  const { t } = useEditorLocale();
  switch (item.type) {
    case "logo":
      return config.branding.logoMediaAssetId || config.branding.brandMarkSvg
        ? t("Uses the logo from the Brand tab")
        : t("No logo uploaded yet");
    case "wordmark":
      return config.identity.publicName || t("No business name set yet");
    case "nav": {
      const n = config.navigation.items.filter((i) => i.visible).length;
      return t("{count} links").replace("{count}", String(n));
    }
    case "cta":
      return (
        item.label ??
        config.identity.primaryCtaLabel ??
        t("No button text set yet")
      );
    case "social": {
      const n = item.platforms?.length ?? availableSocial.length;
      return t("{count} icons").replace("{count}", String(n));
    }
    case "phone":
      return config.identity.contactPhone ?? t("No phone number set yet");
    case "inquiry":
      return item.showCount === false
        ? t("Icon only")
        : t("Icon with a live count");
    case "saved":
      return t("Icon with a live count");
    case "language":
      return t("Only shows when the site has more than one language");
    case "spacer":
      return t("Pushes the next item further along");
    default:
      return null;
  }
}

// ── Item settings ───────────────────────────────────────────────────────────

function ItemSettings({
  item,
  zone,
  index,
  count,
  armed,
  onArm,
  onRemove,
  onNudge,
  onMoveZone,
  onUpdate,
  availableSocial,
}: ItemRowProps) {
  const { t } = useEditorLocale();
  const responsive = item.responsive ?? {};
  // Options and normalised value together, so the select's value is always one
  // of its options. Same guard, same reason as the preset picker: a mismatch
  // silently shows the FIRST option and saves it on the next change.
  const verbModel = headerVerbPickerModel(
    item.type === "cta" || item.type === "inquiry" ? item.headerVerb : undefined,
    "en",
  );

  return (
    <div className="flex flex-col gap-2.5 px-2 pb-2.5 pt-1">
      {/* Position */}
      <div className="flex items-center gap-1.5">
        <SelectField
          label="Zone"
          className="flex-1"
          value={zone}
          onChange={(next) => onMoveZone(next as HeaderZone)}
          options={HEADER_ZONES.map((z) => ({
            value: z,
            label: ZONE_META[z].label,
          }))}
        />
        <div className="flex shrink-0 items-center gap-1 pt-4">
          <IconButton
            label={t("Move up")}
            disabled={index === 0}
            onClick={() => onNudge(-1)}
          >
            <ArrowGlyph up />
          </IconButton>
          <IconButton
            label={t("Move down")}
            disabled={index === count - 1}
            onClick={() => onNudge(1)}
          >
            <ArrowGlyph />
          </IconButton>
        </div>
      </div>

      {/* Kind-specific content */}
      {item.type === "cta" || item.type === "inquiry" ? (
        <>
          <TextRow
            label="Button text"
            hint="Leave empty to use the wording from the Brand tab."
            value={item.label ?? ""}
            maxLength={60}
            onChange={(v) => onUpdate({ ...item, label: v || undefined })}
          />
          {/* THE BUTTON IS A VERB, NOT A TYPED PATH (F1e).
              This was a free-text "Link" field hinted "A path like /contact" —
              and on an agency host `/contact` is a CMS clean URL that 404s
              until the operator creates that page, so the hint's own example
              was a dead link on most workspaces. Every path a person would
              reasonably type (/reserve, /menu, /shop, /tickets) is dead for the
              same reason; F1a removed exactly these from the thirteen page
              designs, and this is the one button every storefront renders.
              Choosing a verb means the destination comes from
              `header-verb-options.ts`, where no verb maps to a route that does
              not exist. "A link I choose" keeps the free text for the cases we
              cannot know about. */}
          <SelectField
            label="Where it goes"
            hint={verbModel.options.find((o) => o.value === verbModel.selected)?.hint}
            value={verbModel.selected}
            onChange={(v) => {
              const verb = v as HeaderVerb;
              const href = headerVerbHref(verb, item.href);
              onUpdate({
                ...item,
                headerVerb: verb,
                // A fixed verb clears any leftover custom address, so switching
                // away from "a link I choose" cannot leave the old one in play.
                href: verbNeedsCustomHref(verb) ? (item.href ?? undefined) : (href ?? undefined),
              });
            }}
            options={verbModel.options.map((o) => ({ value: o.value, label: o.label }))}
          />
          {verbNeedsCustomHref(verbModel.selected) ? (
            <TextRow
              label="Address"
              hint="A full web address, or a path on this site that you have made."
              value={item.href ?? ""}
              maxLength={500}
              onChange={(v) => onUpdate({ ...item, href: v || undefined })}
            />
          ) : null}
        </>
      ) : null}
      {item.type === "inquiry" ? (
        <SelectField
          label="Count badge"
          hint="Shows how many talent the visitor has added."
          value={item.showCount === false ? "off" : "on"}
          onChange={(v) => onUpdate({ ...item, showCount: v === "on" })}
          options={[
            { value: "on", label: "Show the count" },
            { value: "off", label: "Icon only" },
          ]}
        />
      ) : null}
      {item.type === "saved" ? (
        <TextRow
          label="Link"
          hint="Where the saved talent icon takes the visitor."
          value={item.href ?? ""}
          maxLength={500}
          onChange={(v) => onUpdate({ ...item, href: v || undefined })}
        />
      ) : null}
      {item.type === "social" ? (
        <SocialPicker
          selected={item.platforms}
          available={availableSocial}
          onChange={(platforms) =>
            onUpdate({
              ...item,
              platforms: platforms.length
                ? (platforms as NonNullable<
                    Extract<HeaderItem, { type: "social" }>["platforms"]
                  >)
                : undefined,
            })
          }
        />
      ) : null}

      {/* Responsive behaviour */}
      {BREAKPOINT_ROWS.map((bp) => (
        <SelectField
          key={bp.key}
          label={bp.label}
          hint={bp.hint}
          value={responsive[bp.key] ?? ""}
          onChange={(v) =>
            onUpdate({
              ...item,
              responsive: {
                ...responsive,
                [bp.key]: v === "" ? undefined : v,
              },
            } as HeaderItem)
          }
          options={BEHAVIOUR_OPTIONS}
        />
      ))}

      <SelectField
        label="When space runs out"
        hint="Decides which items give way first on a narrow screen."
        value={priorityTierOf(item.priority)}
        onChange={(v) => onUpdate({ ...item, priority: priorityNumberFor(v) })}
        options={PRIORITY_TIERS.map((p) => ({
          value: p.value,
          label: p.label,
        }))}
      />

      <button
        type="button"
        onClick={() => (armed ? onRemove() : onArm())}
        className="cursor-pointer self-start text-[10.5px] font-semibold uppercase tracking-[0.10em]"
        style={
          armed
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
        {armed ? t("Confirm remove") : t("Remove from header")}
      </button>
    </div>
  );
}

function SocialPicker({
  selected,
  available,
  onChange,
}: {
  selected: readonly string[] | undefined;
  available: ReadonlyArray<{ platform: string; label: string }>;
  onChange: (next: string[]) => void;
}) {
  const { t } = useEditorLocale();
  if (available.length === 0) {
    return (
      <p className="text-[11px] leading-snug" style={{ color: CHROME.muted }}>
        {t("Add your social links on the Brand tab and they appear here.")}
      </p>
    );
  }
  // Unset means "all of them, in the order the Brand tab lists them", which is
  // what the renderer already does. Showing that order rather than an empty
  // list keeps the control honest about what the visitor sees today.
  const order = selected?.length
    ? [...selected]
    : available.map((a) => a.platform);
  const shown = order.filter((p) => available.some((a) => a.platform === p));
  const hidden = available
    .map((a) => a.platform)
    .filter((p) => !shown.includes(p));

  const labelOf = (p: string) =>
    available.find((a) => a.platform === p)?.label ?? p;

  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[11.5px] font-semibold"
        style={{ color: CHROME.text }}
      >
        {t("Which icons, in which order")}
      </span>
      {shown.map((platform, i) => (
        <div key={platform} className="flex items-center gap-1">
          <span
            className="min-w-0 flex-1 truncate text-[11.5px]"
            style={{ color: CHROME.text }}
          >
            {labelOf(platform)}
          </span>
          <IconButton
            label={t("Move up")}
            disabled={i === 0}
            onClick={() => {
              const next = [...shown];
              [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
              onChange(next);
            }}
          >
            <ArrowGlyph up />
          </IconButton>
          <IconButton
            label={t("Move down")}
            disabled={i === shown.length - 1}
            onClick={() => {
              const next = [...shown];
              [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
              onChange(next);
            }}
          >
            <ArrowGlyph />
          </IconButton>
          <IconButton
            label={t("Hide this icon")}
            onClick={() => onChange(shown.filter((p) => p !== platform))}
          >
            <CloseGlyph />
          </IconButton>
        </div>
      ))}
      {hidden.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {hidden.map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => onChange([...shown, platform])}
              className="rounded-md px-2 py-1 text-[10.5px] font-medium"
              style={{
                border: `1px solid ${CHROME.lineStrong}`,
                color: CHROME.muted,
              }}
            >
              {t("Add")} {labelOf(platform)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
