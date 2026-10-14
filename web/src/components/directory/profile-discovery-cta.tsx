"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import {
  ContactTalentButton,
  OpenInquiryCartButton,
  SaveTalentButton,
} from "@/components/directory/directory-inquiry-actions";
import { Button } from "@/components/ui/button";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { agencyContactHref } from "@/lib/directory/agency-contact-href";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

export function ProfileDiscoveryCta({
  talentId,
  profileCode,
  displayName,
  sourcePage,
  mode,
  initialSaved = false,
  portalInquiryHref,
  profileCta,
  inquiry,
}: {
  talentId: string;
  profileCode: string;
  displayName: string;
  sourcePage: string;
  mode: "header" | "sidebar" | "footer";
  initialSaved?: boolean;
  portalInquiryHref?: string | null;
  profileCta: DirectoryUiCopy["profileCta"];
  inquiry: DirectoryUiCopy["inquiry"];
}) {
  const pathname = usePathname();
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
          portalInquiryHref={portalInquiryHref}
          inquiry={inquiry}
          label={profileCta.contactAboutTalent}
          className="bg-[var(--impronta-gold)] text-[var(--impronta-gold-ink)] hover:bg-[var(--impronta-gold-bright)]"
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
          className="w-full bg-[var(--impronta-gold)] text-[var(--impronta-gold-ink)] hover:bg-[var(--impronta-gold-bright)]"
        />
        <OpenInquiryCartButton
          inquiry={inquiry}
          portalInquiryHref={portalInquiryHref}
          label={profileCta.openInquiryCart}
          className="w-full border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
        />
      </>
    );
  }

  // GRK-050 — "Contact the agency" must not open the Inquire chat drawer.
  // Route to the host `/contact` surface (form), leaving Inquire as the only
  // path into the guest-chat launcher.
  return (
    <>
      <SaveTalentButton
        talent={talent}
        sourcePage={sourcePage}
        initialSaved={initialSaved}
        variant="default"
        inquiry={inquiry}
        className="bg-[var(--impronta-gold)] text-[var(--impronta-gold-ink)] hover:bg-[var(--impronta-gold-bright)]"
      />
      <Button
        asChild
        size="lg"
        variant="outline"
        className="border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
      >
        <Link href={clientLocaleHref(pathname, "/directory")}>
          {profileCta.browseMoreTalent}
        </Link>
      </Button>
      <Button
        asChild
        size="lg"
        variant="ghost"
        className="gap-2 text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
      >
        <Link href={agencyContactHref(pathname, { profileCode })}>
          <Mail className="size-4" />
          {profileCta.contactImpronta}
        </Link>
      </Button>
    </>
  );
}
