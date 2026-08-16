"use client";

/**
 * WF-6 — one zone (left / center / right) of the header Arrange tab.
 *
 * A zone is a titled card holding its item list, its add-item palette, and its
 * own empty state. Drag reorder inside the zone rides the inspector kit's
 * existing `DraggableList` (the same primitive the Navigation tab uses);
 * moving BETWEEN zones is a button + select on the row, because a cross-zone
 * pointer drag between three separate lists is a gesture this kit does not
 * have and a keyboard user could not perform.
 *
 * Split out of `RegionsTab.tsx` for the 800-line `max-lines` cap.
 */

import { DraggableList } from "../../kit";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "../../../kit";
import { FIELD_KIT } from "../../field-kit";
import { useEditorLocale } from "../../../use-editor-locale";
import {
  HEADER_ITEM_KINDS,
  MAX_ITEMS_PER_ZONE,
  addItem,
  moveItem,
  nudgeItem,
  removeItem,
  updateItem,
  type HeaderItemKind,
  type HeaderRegions,
  type HeaderZone,
} from "@/lib/site-admin/sections/site_header/regions-editing";
import type { HeaderItem } from "@/lib/site-admin/sections/site_header/schema";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import { ITEM_META, ItemGlyph, ZONE_META } from "./regions-meta";
import { ItemRow } from "./regions-item-row";

export interface ZoneProps {
  zone: HeaderZone;
  regions: HeaderRegions;
  openRow: string | null;
  setOpenRow: (v: string | null) => void;
  armed: string | null;
  setArmed: (v: string | null) => void;
  paletteOpen: boolean;
  onTogglePalette: () => void;
  onChange: (next: HeaderRegions) => void;
  config: SiteHeaderConfig;
  availableSocial: ReadonlyArray<{ platform: string; label: string }>;
}

export function Zone({
  zone,
  regions,
  openRow,
  setOpenRow,
  armed,
  setArmed,
  paletteOpen,
  onTogglePalette,
  onChange,
  config,
  availableSocial,
}: ZoneProps) {
  const { t } = useEditorLocale();
  const items = regions[zone];
  const full = items.length >= MAX_ITEMS_PER_ZONE;

  return (
    <section
      className="flex flex-col gap-2 p-2.5"
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: CHROME_RADII.lg,
        boxShadow: CHROME_SHADOWS.card,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span
            className="text-[11.5px] font-semibold"
            style={{ color: CHROME.text }}
          >
            {t(ZONE_META[zone].label)}
          </span>
          <span
            className="text-[10.5px] leading-snug"
            style={{ color: CHROME.muted }}
          >
            {t(ZONE_META[zone].description)}
          </span>
        </div>
        <button
          type="button"
          onClick={onTogglePalette}
          disabled={full}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            // The field kit's selected-chip pair: accent ink on an 8% accent
            // fill, with the same accent as the edge. Same recipe as
            // FIELD_KIT.accentFill so an open palette reads as "selected".
            background: paletteOpen ? FIELD_KIT.accentFill : "transparent",
            color: paletteOpen ? FIELD_KIT.accent : CHROME.muted,
            border: `1px solid ${paletteOpen ? FIELD_KIT.accent : "transparent"}`,
          }}
          title={full ? t("This zone is full") : t("Add an item here")}
        >
          {paletteOpen ? t("Close") : t("Add item")}
        </button>
      </div>

      {paletteOpen ? (
        <Palette
          onPick={(kind) => onChange(addItem(regions, zone, kind))}
        />
      ) : null}

      {items.length === 0 ? (
        <p
          className="rounded-md border border-dashed px-2.5 py-3 text-center text-[11px]"
          style={{ borderColor: CHROME.lineStrong, color: CHROME.muted }}
        >
          {t("Nothing in this zone yet.")}
        </p>
      ) : (
        <DraggableList<HeaderItem>
          items={items as HeaderItem[]}
          keyOf={(item, i) => `${zone}-${item.type}-${i}`}
          onReorder={(next) => onChange({ ...regions, [zone]: next })}
        >
          {(item, index, handleProps) => {
            const rowId = `${zone}:${index}`;
            return (
              <ItemRow
                item={item}
                zone={zone}
                index={index}
                count={items.length}
                handleProps={handleProps}
                open={openRow === rowId}
                onToggle={() => setOpenRow(openRow === rowId ? null : rowId)}
                armed={armed === rowId}
                onArm={() => setArmed(rowId)}
                onRemove={() => {
                  setArmed(null);
                  setOpenRow(null);
                  onChange(removeItem(regions, zone, index));
                }}
                onNudge={(dir) => {
                  setOpenRow(null);
                  onChange(nudgeItem(regions, zone, index, dir));
                }}
                onMoveZone={(target) => {
                  setOpenRow(null);
                  onChange(
                    moveItem(
                      regions,
                      { zone, index },
                      { zone: target, index: regions[target].length },
                    ),
                  );
                }}
                onUpdate={(next) =>
                  onChange(updateItem(regions, zone, index, next))
                }
                config={config}
                availableSocial={availableSocial}
              />
            );
          }}
        </DraggableList>
      )}
    </section>
  );
}

// ── Palette ─────────────────────────────────────────────────────────────────

function Palette({ onPick }: { onPick: (kind: HeaderItemKind) => void }) {
  const { t } = useEditorLocale();
  return (
    <div
      className="grid grid-cols-2 gap-1.5 p-1.5"
      style={{
        background: "rgba(24, 24, 27, 0.03)",
        borderRadius: CHROME_RADII.md,
      }}
    >
      {HEADER_ITEM_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          title={t(ITEM_META[kind].description)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white"
          style={{ color: CHROME.text }}
        >
          <span style={{ color: CHROME.muted }}>
            <ItemGlyph kind={kind} />
          </span>
          <span className="truncate text-[11px] font-medium">
            {t(ITEM_META[kind].label)}
          </span>
        </button>
      ))}
    </div>
  );
}
