"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BookmarkPlus, Mail } from "lucide-react";
import { setTalentSaved } from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { cn } from "@/lib/utils";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

type TalentSummary = {
  id: string;
  profileCode: string;
  displayName: string;
};

type SharedActionProps = {
  talent: TalentSummary;
  className?: string;
  sourcePage: string;
};

export function SaveTalentButton({
  talent,
  sourcePage,
  className,
  initialSaved = false,
  variant = "outline",
  inquiry,
  label,
  savedLabel,
}: SharedActionProps & {
  initialSaved?: boolean;
  variant?: "outline" | "default" | "ghost" | "secondary";
  inquiry: DirectoryUiCopy["inquiry"];
  label?: string;
  savedLabel?: string;
}) {
  const saveLabel = label ?? inquiry.saveThisTalent;
  const savedText = savedLabel ?? inquiry.savedToInquiryCart;
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const [pending, startTransition] = useTransition();
  const state = usePublicDiscoveryState();
  const [mounted, setMounted] = useState(false);
  const saved = mounted
    ? state.isSaved(talent.id)
    : initialSaved;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Button
      type="button"
      variant={variant}
      className={cn("gap-2", className)}
      disabled={pending}
      aria-pressed={saved}
      onClick={() => {
        const nextSaved = !saved;
        state.setSearchContext({
          ...(state.searchContext ?? {
            q: "",
            locationSlug: "",
            sort: "recommended",
            taxonomyTermIds: [],
            sourcePage,
          }),
          sourcePage,
          selectedTalentIds: nextSaved ? [talent.id] : undefined,
          selectedTalent: nextSaved
            ? [
                {
                  id: talent.id,
                  profileCode: talent.profileCode,
                  displayName: talent.displayName,
                },
              ]
            : undefined,
        });
        state.setSavedState(talent.id, nextSaved);
        startTransition(async () => {
          const result = await setTalentSaved(talent.id, nextSaved);
          if (!result.ok) {
            state.setSavedState(talent.id, saved);
            state.setFlash({
              tone: "error",
              title: inquiry.flashCouldNotUpdateSaved,
              message: result.error,
            });
          } else {
            state.setFlash({
              tone: "success",
              title: nextSaved ? inquiry.flashSavedTitle : inquiry.flashRemovedTitle,
              message: nextSaved ? inquiry.flashAddedShortlist : inquiry.flashRemovedShortlist,
            });
            if (nextSaved) {
              inquiryModal?.bumpSaveCue();
            }
          }
        });
      }}
    >
      <BookmarkPlus className="size-4" />
      {saved ? savedText : saveLabel}
    </Button>
  );
}

export function ContactTalentButton({
  talent,
  sourcePage,
  className,
  initialSaved = false,
  variant = "default",
  inquiry,
  label,
}: SharedActionProps & {
  variant?: "outline" | "default" | "ghost" | "secondary";
  inquiry: DirectoryUiCopy["inquiry"];
  label?: string;
  initialSaved?: boolean;
}) {
  const contactLabel = label ?? inquiry.contactAboutTalent;
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const state = usePublicDiscoveryState();
  const [mounted, setMounted] = useState(false);
  const saved = mounted
    ? state.isSaved(talent.id)
    : initialSaved;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Button
      type="button"
      variant={variant}
      className={cn("gap-2", className)}
      disabled={pending}
      onClick={() => {
        state.setSearchContext({
          ...(state.searchContext ?? {
            q: "",
            locationSlug: "",
            sort: "recommended",
            taxonomyTermIds: [],
            sourcePage,
          }),
          sourcePage,
          selectedTalentIds: [talent.id],
          selectedTalent: [
            {
              id: talent.id,
              profileCode: talent.profileCode,
              displayName: talent.displayName,
            },
          ],
        });

        startTransition(async () => {
          if (!saved) {
            state.setSavedState(talent.id, true);
            const result = await setTalentSaved(talent.id, true);
            if (!result.ok) {
              state.setSavedState(talent.id, false);
              state.setFlash({
                tone: "error",
                title: inquiry.flashCouldNotSaveTalent,
                message: result.error,
              });
              return;
            }
            inquiryModal?.bumpSaveCue();
          }
          if (inquiryModal) {
            inquiryModal.openInquiry();
          } else {
            router.push(clientLocaleHref(pathname, "/directory"));
          }
        });
      }}
    >
      <Mail className="size-4" />
      {contactLabel}
    </Button>
  );
}

export function OpenInquiryCartButton({
  className,
  inquiry,
  label,
}: {
  className?: string;
  inquiry: DirectoryUiCopy["inquiry"];
  label?: string;
}) {
  const cartLabel = label ?? inquiry.openInquiry;
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("gap-2", className)}
      onClick={() => {
        if (inquiryModal) {
          inquiryModal.openInquiry();
        } else {
          router.push(clientLocaleHref(pathname, "/directory"));
        }
      }}
    >
      <Mail className="size-4" />
      {cartLabel}
    </Button>
  );
}
