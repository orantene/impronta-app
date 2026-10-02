"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { websiteSliceTarget, type WebsiteSliceKey } from "@/lib/talent/website-eligibility";

/**
 * One opener for every free-website checklist row (sheet, Today card, agenda
 * Today). Targets come from `websiteSliceTarget`, so all surfaces agree.
 * `onIntro` lets a surface open its own intro writer; without it the intro
 * row opens the drawer's About section.
 */
export function useOpenWebsiteSlice(onIntro?: () => void) {
  const { bridgeTalentSelfProfile, openDrawer, setTalentPage } = useAdminShell();
  const router = useRouter();
  const talentId = bridgeTalentSelfProfile?.id ?? null;
  return useCallback(
    (key: WebsiteSliceKey | null) => {
      const target = key ? websiteSliceTarget(key) : null;
      if (target?.kind === "intro" && onIntro) {
        onIntro();
        return;
      }
      if (target?.kind === "services") {
        setTalentPage("services");
        router.push("/talent/services");
        return;
      }
      const section =
        target?.kind === "drawer" ? target.section : target?.kind === "intro" ? "about" : "services";
      if (!talentId) {
        setTalentPage("profile");
        router.push("/talent/profile");
        return;
      }
      openDrawer("talent-profile-shell", { mode: "edit-self", talentId, section });
    },
    [onIntro, openDrawer, router, setTalentPage, talentId],
  );
}
