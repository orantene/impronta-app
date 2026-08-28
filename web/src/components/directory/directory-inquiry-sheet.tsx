"use client";

/**
 * DirectoryInquirySheet — the public directory's inquiry entry point.
 *
 * Lane B / B2 (2026-05-22): the form body is now the canonical
 * `InquiryDrawer` (→ `submitInquiryNowAction` → `submitInquiry` engine),
 * replacing the legacy `InquiryCartForm` divergence.
 *
 * The directory's talent quick-add survives the swap (execution-plan
 * risk #3): it rides in through the drawer's `talentToolsSlot`, rendered
 * inside the Talent section right beside the selected-talent chips. The
 * shortlist (saved_talent cart) stays live inside the composer via
 * `bindToInquiryCart` — the canonical `useInquiryCart` contract.
 *
 * The payload is prefetched on mount so the composer opens instantly
 * (no loading-sheet flash). Auxiliary states (unconfigured /
 * inquiries-paused / the email-deep-link success panel) render in a
 * light side sheet; the compose state renders the full `InquiryDrawer`.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { getDirectoryInquirySheetData } from "@/app/(public)/directory/get-inquiry-sheet-data";
import { DirectoryInquirySuccessPanel } from "@/components/directory/directory-inquiry-success-panel";
import { useDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { InquiryTalentQuickAdd } from "@/components/directory/inquiry-talent-quick-add";
import { InquiryDrawer, InquiryDrawerShell, type RosterLiteItem } from "@/components/inquiry/InquiryDrawer";
import { Button } from "@/components/ui/button";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { Locale } from "@/i18n/config";
import type { DirectoryInquiryPayload } from "@/lib/load-directory-inquiry-payload";

type DirectoryInquirySheetProps = {
  ui: DirectoryUiCopy;
  locale: Locale;
};

export function DirectoryInquirySheet({ ui }: DirectoryInquirySheetProps) {
  const s = ui.inquirySheet;
  const { open, setOpen, success, clearSuccess } = useDirectoryInquiryModal();
  const { savedIds, searchContext } = usePublicDiscoveryState();
  const [payload, setPayload] = useState<DirectoryInquiryPayload | null>(null);

  const refreshPayload = useCallback(() => {
    void getDirectoryInquirySheetData().then((p) => {
      setPayload(p);
    });
  }, []);

  // Prefetch on mount + refresh whenever the sheet opens. The mount
  // prefetch means the canonical InquiryDrawer is ready the instant the
  // user clicks "Your inquiry" — no transient loading sheet, no swap from
  // one drawer to another.
  useEffect(() => {
    if (success) return;
    refreshPayload();
  }, [open, success, refreshPayload]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) clearSuccess();
  };

  if (!open) return null;

  const ready = payload?.kind === "ready" ? payload : null;
  const composerReady =
    !success && ready !== null && ready.inquiriesOpen && ready.tenantSlug.length > 0;

  // ── Compose state — the canonical InquiryDrawer ──────────────────────────
  if (composerReady && ready) {
    const roster: RosterLiteItem[] = ready.orderedTalent.map((t) => ({
      id: t.id,
      name: t.display_name ?? s.talentFallbackName,
      photoUrl: t.photo_url,
    }));
    const isClient = ready.mode === "client";

    return (
      <InquiryDrawer
        source="agency_site"
        tenantSlug={ready.tenantSlug}
        agencyName={ready.agencyName}
        client={
          isClient
            ? {
                displayName: ready.defaultName,
                email: ready.defaultEmail,
                phone: ready.defaultPhone,
                company: ready.defaultCompany,
                trust_level: "verified",
              }
            : null
        }
        roster={roster}
        bindToInquiryCart
        enableDraftAutosave={false}
        initialIntent={{
          // The event fields this visitor already gave the guest chat. Spread
          // FIRST so the explicit sections below always win: requester/client
          // come from the account, and talent from the shared lineup, both of
          // which are more current than anything a draft carries.
          ...(ready.carriedIntent ?? {}),
          requester: {
            name: ready.defaultName ?? "",
            email: ready.defaultEmail ?? "",
            phone: ready.defaultPhone ?? "",
            trust_level: isClient ? "verified" : "basic",
          },
          client: {
            company: ready.defaultCompany ?? "",
            same_as_requester: true,
          },
          talent: {
            selected_ids: savedIds,
            selection_mode:
              savedIds.length > 0 ? "i_know_who" : "agency_recommends",
          },
          source_context: {
            referrer_page: searchContext?.sourcePage ?? "/directory",
            directory_search: {
              q: searchContext?.q ?? null,
              locationSlug: searchContext?.locationSlug ?? null,
              sort: searchContext?.sort ?? null,
              taxonomyTermIds: searchContext?.taxonomyTermIds ?? [],
            },
          },
        }}
        talentToolsSlot={<InquiryTalentQuickAdd copy={ui.inquiryQuickAdd} />}
        onClose={() => handleOpenChange(false)}
      />
    );
  }

  // Open but the payload is still prefetching: render the shell with a loading
  // line rather than `null` (a pre-prefetch click used to paint nothing — the
  // drawer simply didn't appear until the fetch resolved). We're past the
  // `if (!open) return null` guard, so the drawer should be visible here.
  if (!success && !payload) {
    return (
      <InquiryDrawerShell
        label="Inquiry"
        title={s.titleStartInquiry}
        subtitle={s.descEmptyShortlist}
        onClose={() => handleOpenChange(false)}
      >
        <p className="text-sm text-muted-foreground">{s.loading}</p>
      </InquiryDrawerShell>
    );
  }

  // ── Auxiliary states — InquiryDrawerShell for visual consistency ──
  const auxTitle = success ? s.titleThankYou : s.titleStartInquiry;
  const auxSubtitle = success ? s.descThankYou : s.descEmptyShortlist;

  // ── Auxiliary states — light side sheet ──────────────────────────────────
  return (
    <InquiryDrawerShell
      label="Inquiry"
      title={auxTitle}
      subtitle={auxSubtitle}
      onClose={() => handleOpenChange(false)}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {success ? (
          <DirectoryInquirySuccessPanel
            success={success}
            signedIn={success.email === null}
            copy={ui.inquirySuccess}
          />
        ) : payload?.kind === "unconfigured" ? (
          <p className="text-sm text-destructive">{s.unconfigured}</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">{s.loading}</p>
        ) : !ready.tenantSlug ? (
          <p className="text-sm text-destructive">{s.unconfigured}</p>
        ) : (
          <p className="rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-m text-muted-foreground">
            {s.inquiriesPausedNotice}
          </p>
        )}

        <Button variant="ghost" className="w-full text-muted-foreground" asChild>
          <Link href="/directory">{s.backToDirectory}</Link>
        </Button>
      </div>
    </InquiryDrawerShell>
  );
}
