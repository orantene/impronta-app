"use client";

import { useEffect, useRef } from "react";
import { useAdminShell } from "@/components/admin/shell/internal/state";

export function TalentProfileFieldsRouteSyncer() {
  const { bridgeTalentSelfProfile, openDrawer, setTalentPage } = useAdminShell();
  const openedRef = useRef(false);

  useEffect(() => {
    setTalentPage("profile");
  }, [setTalentPage]);

  useEffect(() => {
    if (openedRef.current || !bridgeTalentSelfProfile?.id) return;
    openedRef.current = true;
    openDrawer("talent-profile-shell", {
      mode: "edit-self",
      talentId: bridgeTalentSelfProfile.id,
      section: "profile_fields",
    });
  }, [bridgeTalentSelfProfile?.id, openDrawer]);

  return null;
}
