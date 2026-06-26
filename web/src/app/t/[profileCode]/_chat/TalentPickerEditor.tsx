"use client";

/**
 * TalentPickerEditor — reusable in-chat talent add/remove editor (Phase 2 / P2,
 * §4.B.3). Standalone so the upcoming details sidebar can rehouse it unchanged.
 *
 * Wiring: every change calls onChange(selectedIds, selectionMode, selectedNames),
 * which the panel routes through useUnifiedInquiry.patch({ kind: "talent", ... }).
 * That writes interpreted_query.talent.selected_ids + selection_mode and emits a
 * synced thread note, exactly like Date/Location chips do today. The avatar-stack
 * visual on the launcher pill is Phase 3 — this is the functional add/remove + sync.
 *
 * Add uses the shared SearchTalentField (no forked roster search). Already-selected
 * talent reflect as removable chips above the search. When no roster is injected
 * the search degrades to a gentle note while remove still works off selected ids.
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes,
 * "client" never "buyer".
 */

import { useEffect, useMemo, useState } from "react";

import type { ListGuestTenantRosterCallback } from "@/lib/inquiry/guest-chat-contract";
import type { RosterLiteItem } from "@/components/inquiry/InquiryDrawer";
import { SearchTalentField } from "@/components/inquiry/SearchTalentField";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { C, FONT, accentText } from "./mini-chat-styles";

export type TalentPickerEditorProps = {
  /** Currently-selected talent profile ids on the inquiry. */
  selectedIds: string[];
  /** Tenant accent color (CSS string). */
  accent: string;
  /** The tenant slug, passed to the injected roster loader. */
  tenantSlug: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /**
   * Injected guest-safe roster loader (public name/thumb/category). Null hides
   * the search and leaves only the remove-existing affordance. The panel injects
   * the real server action so this component imports no backend module.
   */
  onListRoster?: ListGuestTenantRosterCallback | null;
  /**
   * Commit a new selection set. The parent patches the single inquiry record.
   * selectedNames is best-effort (drives a friendlier system note).
   */
  onChange: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
};

export function TalentPickerEditor({
  selectedIds,
  accent,
  tenantSlug,
  t,
  onListRoster,
  onChange,
}: TalentPickerEditorProps) {
  const [roster, setRoster] = useState<RosterLiteItem[]>([]);
  const [rosterState, setRosterState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );

  // Load the public roster once when the editor mounts (if a loader is injected).
  useEffect(() => {
    if (!onListRoster || !tenantSlug) return;
    let cancelled = false;
    setRosterState("loading");
    void (async () => {
      try {
        const res = await onListRoster({ tenantSlug });
        if (cancelled) return;
        if (res.ok) {
          setRoster(
            res.roster.map((r) => ({
              id: r.id,
              name: r.name,
              primaryTypeLabel: r.primaryTypeLabel,
              city: r.city,
              photoUrl: r.photoUrl,
            })),
          );
          setRosterState("ready");
        } else {
          setRosterState("error");
        }
      } catch {
        if (!cancelled) setRosterState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onListRoster, tenantSlug]);

  // Index roster by id so selected-talent chips can show real names/thumbs even
  // for ids that were preselected before the roster finished loading.
  const byId = useMemo(() => {
    const m = new Map<string, RosterLiteItem>();
    for (const r of roster) m.set(r.id, r);
    return m;
  }, [roster]);

  function nameFor(id: string): string {
    return byId.get(id)?.name ?? t("public.guestChat.talentSelectedFallback");
  }

  function namesFor(ids: string[]): string[] {
    return ids.map(nameFor);
  }

  function handleAdd(item: RosterLiteItem) {
    if (selectedIds.includes(item.id)) return;
    const next = [...selectedIds, item.id];
    onChange(next, "i_know_who", namesFor(next));
  }

  function handleRemove(id: string) {
    const next = selectedIds.filter((x) => x !== id);
    onChange(
      next,
      next.length > 0 ? "i_know_who" : "agency_recommends",
      namesFor(next),
    );
  }

  function handleRecommend() {
    onChange([], "agency_recommends", []);
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        background: C.surfaceFaint,
        borderTop: `1px solid ${C.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: C.inkMuted,
          textTransform: "uppercase",
        }}
      >
        {t("public.guestChat.talentLabel")}
      </span>

      {/* Selected talent as removable chips (always available). */}
      {selectedIds.length > 0 && (
        <ul
          role="list"
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {selectedIds.map((id) => {
            const item = byId.get(id);
            return (
              <li
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 32,
                  padding: "0 6px 0 4px",
                  borderRadius: 999,
                  border: `1.5px solid ${accent}`,
                  background: `${accent}14`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: C.surfaceCool,
                    flexShrink: 0,
                    backgroundImage: item?.photoUrl
                      ? `url(${item.photoUrl})`
                      : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "50% 20%",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    // a11y: name text sits on a pale `${accent}14` tint — clamp a
                    // bright tenant accent (gold) to an AA-legible variant.
                    color: accentText(accent),
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {nameFor(id)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(id)}
                  aria-label={interpolate(t("public.guestChat.talentRemoveAria"), {
                    name: nameFor(id),
                  })}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: "none",
                    background: C.ink,
                    color: "#ffffff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    lineHeight: 1,
                    flexShrink: 0,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add via the shared roster search (when a loader is injected + ready). */}
      {onListRoster ? (
        rosterState === "ready" ? (
          <SearchTalentField
            roster={roster}
            selectedIds={selectedIds}
            onAdd={handleAdd}
          />
        ) : rosterState === "loading" ? (
          <p style={{ margin: 0, fontSize: 12, color: C.inkMuted }}>
            {t("public.guestChat.talentRosterLoading")}
          </p>
        ) : rosterState === "error" ? (
          // a11y: roster loading + error copy routed through C.inkMuted (~6:1)
          // instead of the dim token (finding #6 — error text is the worst case).
          <p style={{ margin: 0, fontSize: 12, color: C.inkMuted }}>
            {t("public.guestChat.talentRosterError")}
          </p>
        ) : null
      ) : null}

      {/* Recommend fallback — clears selection + sets the agency_recommends mode. */}
      <button
        type="button"
        onClick={handleRecommend}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          fontFamily: FONT,
          fontSize: 11.5,
          fontWeight: 500,
          color: C.inkMuted,
          cursor: "pointer",
          padding: "2px 0",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {t("public.guestChat.talentLetAgencyRecommend")}
      </button>
    </div>
  );
}
