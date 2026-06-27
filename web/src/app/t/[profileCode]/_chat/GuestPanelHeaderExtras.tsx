"use client";

/**
 * GuestPanelHeaderExtras — the U2 thread-switcher strip extracted out of
 * MiniChatPanel to keep that file under the 800-line cap. It owns ONLY the
 * "list my live conversations" fetch + the switcher render; it adds no new
 * fetch path beyond the injected onListGuestInquiries callback.
 *
 * Mounted by the panel in the header region (just under the agency name/status
 * row, above the messages body) and ONLY when onListGuestInquiries is non-null.
 * Returns null for single-thread guests (GuestThreadSwitcher self-hides at <2).
 *
 * Honest presence only: per-row "Replies {label}" comes from real timestamps in
 * the action; this component never invents "online"/"typing".
 */

import { useEffect, useMemo, useState } from "react";

import type {
  GuestInquirySummary,
  ListGuestInquiriesCallback,
} from "@/lib/inquiry/guest-chat-contract";
import { createTranslator } from "@/i18n/messages";

import type { SurfaceMode } from "./mini-chat-styles";
import { GuestThreadSwitcher } from "./GuestThreadSwitcher";

export type GuestPanelHeaderExtrasProps = {
  /** Whether the panel is open (drives the slow refresh interval). */
  open: boolean;
  /** Tenant slug — the switcher list is scoped to this brand + the guest cookie. */
  tenantSlug: string;
  /** The inquiry currently shown in the panel (the active tab). */
  activeInquiryId: string | null;
  accent: string;
  accentInk: string;
  /** Per-inquiry last-seen ISO cursor, for the client-side 'new' dot. */
  seenAtByInquiry: Record<string, string>;
  /** Injected list action. The strip renders nothing until this returns ≥2. */
  onListGuestInquiries: ListGuestInquiriesCallback;
  /** Switch the panel to another owned inquiry. */
  onSelect: (inquiryId: string) => void;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  /**
   * Phase 5 — guest UI locale (brand.locale), so the project switcher labels +
   * draft/sent pills render in the tenant language. Defaults to "en".
   */
  locale?: string | null;
};

export function GuestPanelHeaderExtras({
  open,
  tenantSlug,
  activeInquiryId,
  accent,
  accentInk,
  seenAtByInquiry,
  onListGuestInquiries,
  onSelect,
  surfaceMode = "light",
  locale,
}: GuestPanelHeaderExtrasProps) {
  const [inquiries, setInquiries] = useState<GuestInquirySummary[]>([]);
  const t = useMemo(() => createTranslator(locale ?? "en"), [locale]);

  // Load once on open, then refresh on a slow ~30s cadence while open. The
  // switcher is a convenience surface, not the live thread — a slow refresh is
  // plenty and avoids piling onto the panel's ~4s message poll.
  useEffect(() => {
    if (!open || !tenantSlug) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await onListGuestInquiries({ tenantSlug });
        if (!stopped && res.ok) setInquiries(res.inquiries);
      } catch {
        /* transient — the next interval retries */
      }
    };

    void load();
    timer = setInterval(load, 30_000);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [open, tenantSlug, onListGuestInquiries]);

  // GuestThreadSwitcher self-hides for <2 conversations (progressive disclosure).
  return (
    <GuestThreadSwitcher
      inquiries={inquiries}
      activeInquiryId={activeInquiryId}
      accent={accent}
      accentInk={accentInk}
      seenAtByInquiry={seenAtByInquiry}
      onSelect={onSelect}
      surfaceMode={surfaceMode}
      t={t}
    />
  );
}
