"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDirectoryInquirySheetData } from "@/app/(public)/directory/get-inquiry-sheet-data";
import { InquiryForm } from "@/app/(public)/directory/cart/inquiry-form";
import {
  DirectoryInquirySuccessPanel,
} from "@/components/directory/directory-inquiry-success-panel";
import {
  useDirectoryInquiryModal,
} from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { InquiryAiStrip } from "@/components/directory/inquiry-ai-strip";
import { InquiryTalentQuickAdd } from "@/components/directory/inquiry-talent-quick-add";
import { SavedTalentCartList } from "@/components/directory/saved-talent-cart-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { Locale } from "@/i18n/config";
import { formatProfilesInRequest } from "@/lib/directory/directory-ui-copy";
import type { DirectoryInquiryPayload } from "@/lib/load-directory-inquiry-payload";
import Link from "next/link";

type DirectoryInquirySheetProps = {
  ui: DirectoryUiCopy;
  locale: Locale;
};

export function DirectoryInquirySheet({ ui, locale }: DirectoryInquirySheetProps) {
  const s = ui.inquirySheet;
  const { open, setOpen, success, clearSuccess } = useDirectoryInquiryModal();
  const { savedIds, savedCount } = usePublicDiscoveryState();
  const [payload, setPayload] = useState<DirectoryInquiryPayload | null>(null);

  const refreshPayload = useCallback(() => {
    void getDirectoryInquirySheetData().then((p) => {
      setPayload(p);
    });
  }, []);

  const savedKey = savedIds.join(",");

  useEffect(() => {
    if (!open) return;
    if (success) return;
    refreshPayload();
  }, [open, success, refreshPayload, savedKey]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      clearSuccess();
    }
  };

  const ready = payload?.kind === "ready" ? payload : null;

  const selectedTalent = useMemo(() => {
    if (!ready) return [];
    const byId = new Map(ready.orderedTalent.map((t) => [t.id, t] as const));
    return savedIds.map((id) => {
      const row = byId.get(id);
      return (
        row ?? {
          id,
          profile_code: "",
          display_name: s.talentFallbackName,
        }
      );
    });
  }, [ready, savedIds, s.talentFallbackName]);

  const cartListTalent = useMemo(
    () =>
      selectedTalent.map((t) => ({
        id: t.id,
        profileCode: t.profile_code || "—",
        displayName: t.display_name ?? s.talentFallbackName,
      })),
    [selectedTalent, s.talentFallbackName],
  );

  const shortlistDescription = formatProfilesInRequest(s, savedCount);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent
        side="right"
        className="flex w-full max-w-lg flex-col border-l border-border/80 bg-background p-0 sm:max-w-xl"
      >
        <div className="border-b border-border/60 px-6 pb-4 pt-6 pr-14">
          <DrawerHeader className="space-y-1 p-0 text-left">
            <DrawerTitle className="font-display text-xl tracking-wide">
              {success
                ? s.titleThankYou
                : savedCount > 0
                  ? s.titleContactAgency
                  : s.titleStartInquiry}
            </DrawerTitle>
            <DrawerDescription className="text-m text-muted-foreground">
              {success
                ? s.descThankYou
                : savedCount > 0
                  ? s.descWithShortlist
                  : s.descEmptyShortlist}
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
          ) : (
            <>
              <InquiryAiStrip
                title={ui.inquirySheet.aiAssistTitle}
                body={ui.inquirySheet.aiAssistBody}
              />
              <InquiryTalentQuickAdd
                disabled={!ready.inquiriesOpen}
                copy={ui.inquiryQuickAdd}
              />

              {savedCount === 0 ? (
                <Card className="border-dashed border-border/80 bg-muted/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{s.shortlistTitle}</CardTitle>
                    <CardDescription>{s.shortlistEmptyDescription}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {s.shortlistEmptyHintBefore}
                      <span className="font-medium text-foreground">{s.shortlistSaveWord}</span>
                      {s.shortlistEmptyHintAfter}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{s.yourShortlistTitle}</CardTitle>
                    <CardDescription>{shortlistDescription}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SavedTalentCartList talents={cartListTalent} copy={ui.inquiryCart} />
                  </CardContent>
                </Card>
              )}

              <Card className="border-border/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.messageDetailsTitle}</CardTitle>
                  <CardDescription>
                    {!ready.inquiriesOpen
                      ? s.messageDetailsPaused
                      : ready.mode === "client"
                        ? s.messageDetailsClient
                        : s.messageDetailsGuest}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ready.inquiriesOpen ? (
                    <InquiryForm
                      agencyWhatsAppNumber={ready.agencyWhatsAppNumber}
                      talentIds={savedIds}
                      mode={ready.mode}
                      defaultEmail={ready.defaultEmail}
                      defaultName={ready.defaultName}
                      defaultPhone={ready.defaultPhone}
                      defaultCompany={ready.defaultCompany}
                      eventTypes={ready.eventTypes}
                      selectedTalent={selectedTalent}
                      formCopy={ui.inquiryForm}
                      inquiryDraftEnabled={ready.aiInquiryDraftEnabled}
                      locale={locale}
                    />
                  ) : (
                    <p className="rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-m text-muted-foreground">
                      {s.inquiriesPausedNotice}
                    </p>
                  )}
                  {ready.mode === "guest" ? (
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      <Link href="/register?next=/directory" className="text-primary underline">
                        {s.guestCtaCreateAccount}
                      </Link>
                      {s.guestCtaAfterCreateLink}
                      <Link href="/login?next=/directory" className="text-primary underline">
                        {s.guestCtaLogIn}
                      </Link>
                      {s.guestCtaAfterLoginLink}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}

          {!success ? (
            <Button variant="ghost" className="w-full text-muted-foreground" asChild>
              <Link href="/directory">{s.backToDirectory}</Link>
            </Button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
