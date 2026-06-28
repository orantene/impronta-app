"use client";

/**
 * LauncherProjectPicker — the MOUNT seam that wires the Phase 5 InquiryProjectPicker
 * into the launcher's `pick_inquiry` resolver state.
 *
 * The pure resolver (inquiry-context-resolver.ts) yields `pick_inquiry` when the
 * viewer is focused on a talent AND already has other open inquiries. The launcher
 * pill keeps its add-style label; THIS component is the actionable surface — an
 * anchored popover that lets the client choose:
 *
 *   Add {firstName} to:
 *     • [existing inquiry · N talents · status]   → captureGuestChip(kind:"talent")
 *                                                    appending the focused talent to
 *                                                    that inquiry's lineup
 *   + Start a new inquiry with just {firstName}   → useInquiryProjectPark.startSeparateInquiry
 *                                                    (park current lineup + seed the new one)
 *
 * Why this lives in its own component (not inline in TalentProfileChatLauncher):
 *   • It owns the lazy enrichment of the resolver's MINIMAL otherOpenInquiries
 *     (OtherOpenInquiry[] = id/phase/label) into the FULL GuestInquirySummary[]
 *     the picker needs (projectLabel + lineup face-stack). The launcher already
 *     receives onListGuestInquiries (the same action that returns the reshaped
 *     summaries newest-first); we call it here, scoped to the open-inquiry ids,
 *     so no second server seam or Mount change is needed and the bundle stays
 *     backend-free (the action is injected, not imported).
 *   • It keeps TalentProfileChatLauncher under the 800-line cap.
 *
 * Imports NO backend module: the guest-safe actions arrive as injected callbacks.
 * Does NOT touch inquiry-permissions, favorites, or the submit engine — it only
 * wires the existing Phase 5 picker + park primitives.
 */

import { useEffect, useMemo, useState } from "react";

import type {
  CaptureGuestChipCallback,
  EnsureGuestChatInquiryCallback,
  GuestInquirySummary,
  ListGuestInquiriesCallback,
} from "@/lib/inquiry/guest-chat-contract";
import type { OtherOpenInquiry } from "@/lib/inquiry/inquiry-context-resolver";
import type { Translator } from "@/i18n/interpolate";
import type { TalentCardRef } from "@/lib/talent-cards/contracts";

import { InquiryProjectPicker } from "./InquiryProjectPicker";
import { useInquiryProjectPark } from "./use-inquiry-project-park";
import type { SurfaceMode } from "./mini-chat-styles";

export type LauncherProjectPickerProps = {
  /** The focused talent the picker adds (profile/card in view). */
  focusedTalentId: string;
  focusedTalentCode: string;
  /** First name of the focused talent, used throughout the picker copy. */
  firstName: string;
  /** Display name (for the seeded new-inquiry lineup item). */
  displayName: string;
  /** The resolver's pick_inquiry set (minimal — ids to enrich + scope the list). */
  otherOpenInquiries: OtherOpenInquiry[];

  tenantSlug: string;
  sourcePage: string;
  /** The CURRENT draft inquiry id, when the panel has already resolved one. */
  currentInquiryId: string | null;

  accent: string;
  surfaceMode: SurfaceMode;
  t: Translator;

  /** Injected guest-safe actions — the picker/park import no backend module. */
  onListGuestInquiries: ListGuestInquiriesCallback;
  onCaptureChip: CaptureGuestChipCallback;
  onEnsureInquiry: EnsureGuestChatInquiryCallback;
};

export function LauncherProjectPicker({
  focusedTalentId,
  focusedTalentCode,
  firstName,
  displayName,
  otherOpenInquiries,
  tenantSlug,
  sourcePage,
  currentInquiryId,
  accent,
  surfaceMode,
  t,
  onListGuestInquiries,
  onCaptureChip,
  onEnsureInquiry,
}: LauncherProjectPickerProps) {
  // Lazily enrich the resolver's MINIMAL other-open set into the FULL summaries
  // the picker renders (projectLabel + lineup face-stack). Newest-first from the
  // action; scope to the resolver's open-inquiry ids so the picker lists exactly
  // the threads the resolver decided are "other open" (and never the focused
  // talent's own active draft, which the resolver already excludes upstream).
  // Stable, sorted, comma-joined identity of the resolver's open-inquiry id set.
  // A primitive key means the fetch effect re-runs ONLY when the set of ids
  // actually changes, even if the parent hands a fresh array reference each render.
  const openIdsKey = useMemo(
    () =>
      [...new Set(otherOpenInquiries.map((o) => o.id))].sort().join(","),
    [otherOpenInquiries],
  );

  const [summaries, setSummaries] = useState<GuestInquirySummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const openIds = new Set(openIdsKey ? openIdsKey.split(",") : []);
    if (openIds.size === 0 || !tenantSlug) {
      setSummaries([]);
      return;
    }
    void (async () => {
      try {
        const res = await onListGuestInquiries({ tenantSlug });
        if (cancelled) return;
        if (res.ok) {
          // Keep newest-first ordering (the picker default-highlights the most
          // recent draft, which relies on it).
          setSummaries(res.inquiries.filter((inq) => openIds.has(inq.inquiryId)));
        } else {
          setSummaries([]);
        }
      } catch {
        if (!cancelled) setSummaries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openIdsKey, tenantSlug, onListGuestInquiries]);

  const { startSeparateInquiry } = useInquiryProjectPark({
    tenantSlug,
    talentProfileId: focusedTalentId,
    talentProfileCode: focusedTalentCode,
    sourcePage,
    currentInquiryId,
    onCaptureChip,
    ensureInquiry: onEnsureInquiry,
  });

  // Add the focused talent to an EXISTING inquiry's lineup. captureGuestChip
  // (kind:"talent") has REPLACE semantics on selected_ids, so append the focused
  // talent to the target's current lineup and write the full set. Idempotent: if
  // the talent is somehow already on that lineup we write the unchanged set.
  const handleAddToInquiry = async (inquiryId: string): Promise<{ ok: boolean }> => {
    const target = (summaries ?? []).find((s) => s.inquiryId === inquiryId);
    const existingIds = target ? target.lineup.map((f) => f.talentProfileId) : [];
    const nextIds = existingIds.includes(focusedTalentId)
      ? existingIds
      : [...existingIds, focusedTalentId];
    const existingNames = target ? target.lineup.map((f) => f.displayName) : [];
    const nextNames = existingIds.includes(focusedTalentId)
      ? existingNames
      : [...existingNames, displayName];
    const res = await onCaptureChip({
      inquiryId,
      kind: "talent",
      value: {
        selectedIds: nextIds,
        selectionMode: "i_know_who",
        selectedNames: nextNames,
      },
    });
    return { ok: res.ok };
  };

  // Start a SEPARATE inquiry seeded with just the focused talent — parks the
  // current working lineup onto its own row first (patch-then-clear), then seeds.
  const handleStartNew = async (): Promise<{ ok: boolean }> => {
    const talent: TalentCardRef = {
      talentProfileId: focusedTalentId,
      profileCode: focusedTalentCode,
      displayName,
    };
    const res = await startSeparateInquiry({ talent, firstName });
    return { ok: res.ok };
  };

  // Until the enrichment resolves (or when it resolves empty), render nothing so
  // the picker never flashes an empty popover. The resolver already guarantees
  // at least one other-open inquiry, so an empty result is a transient cold read.
  if (!summaries || summaries.length === 0) return null;

  return (
    <InquiryProjectPicker
      firstName={firstName}
      openInquiries={summaries}
      onAddToInquiry={handleAddToInquiry}
      onStartNew={handleStartNew}
      accent={accent}
      surfaceMode={surfaceMode}
      t={t}
    />
  );
}
