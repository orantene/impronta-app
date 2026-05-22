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
import { InquiryDrawer, type RosterLiteItem } from "@/components/inquiry/InquiryDrawer";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
                user_id: ready.userId ?? null,
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
          requester: {
            name: ready.defaultName ?? "",
            email: ready.defaultEmail ?? "",
            phone: ready.defaultPhone ?? "",
            user_id: isClient ? ready.userId ?? null : null,
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

  // ── Auxiliary states — light side sheet ──────────────────────────────────
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent
        side="right"
        className="flex w-full max-w-lg flex-col border-l border-border/80 bg-background p-0 sm:max-w-xl"
      >
        <div className="border-b border-border/60 px-6 pb-4 pt-6 pr-14">
          <DrawerHeader className="space-y-1 p-0 text-left">
            <DrawerTitle className="font-display text-xl tracking-wide">
              {success ? s.titleThankYou : s.titleStartInquiry}
            </DrawerTitle>
            <DrawerDescription className="text-m text-muted-foreground">
              {success ? s.descThankYou : s.descEmptyShortlist}
            </DrawerDescription>
          </DrawerHeader>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
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
      </DrawerContent>
    </Drawer>
  );
}
