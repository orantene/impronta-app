"use client";

import Link from "next/link";
import {
  ContactTalentButton,
  OpenInquiryCartButton,
  SaveTalentButton,
} from "@/components/directory/directory-inquiry-actions";
import { Button } from "@/components/ui/button";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

export function ProfileDiscoveryCta({
  talentId,
  profileCode,
  displayName,
  sourcePage,
  mode,
  initialSaved = false,
  profileCta,
  inquiry,
}: {
  talentId: string;
  profileCode: string;
  displayName: string;
  sourcePage: string;
  mode: "header" | "sidebar" | "footer";
  initialSaved?: boolean;
  profileCta: DirectoryUiCopy["profileCta"];
  inquiry: DirectoryUiCopy["inquiry"];
}) {
  const talent = { id: talentId, profileCode, displayName };

  if (mode === "header") {
    return (
      <>
        <SaveTalentButton
          talent={talent}
          sourcePage={sourcePage}
          initialSaved={initialSaved}
          inquiry={inquiry}
          label={profileCta.addToMyList}
          savedLabel={profileCta.savedToMyList}
          className="border-[var(--impronta-gold-border)] bg-black/40 text-[var(--impronta-gold)] backdrop-blur-sm hover:border-[var(--impronta-gold)]/40 hover:bg-black/60 hover:text-[var(--impronta-gold)]"
        />
        <ContactTalentButton
          talent={talent}
          sourcePage={sourcePage}
          initialSaved={initialSaved}
          inquiry={inquiry}
          label={profileCta.contactAboutTalent}
          className="bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
        />
      </>
    );
  }

  if (mode === "sidebar") {
    return (
      <>
        <SaveTalentButton
          talent={talent}
          sourcePage={sourcePage}
          initialSaved={initialSaved}
          variant="default"
          inquiry={inquiry}
          className="w-full bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
        />
        <OpenInquiryCartButton
          inquiry={inquiry}
          label={profileCta.openInquiryCart}
          className="w-full border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
        />
      </>
    );
  }

  return (
    <>
      <SaveTalentButton
        talent={talent}
        sourcePage={sourcePage}
        initialSaved={initialSaved}
        variant="default"
        inquiry={inquiry}
        className="bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
      />
      <Button
        asChild
        size="lg"
        variant="outline"
        className="border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
      >
        <Link href="/directory">{profileCta.browseMoreTalent}</Link>
      </Button>
      <ContactTalentButton
        talent={talent}
        sourcePage={sourcePage}
        initialSaved={initialSaved}
        variant="ghost"
        inquiry={inquiry}
        label={profileCta.contactImpronta}
        className="text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
      />
    </>
  );
}
