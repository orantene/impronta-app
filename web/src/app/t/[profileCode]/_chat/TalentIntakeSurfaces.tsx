import type { ComponentProps } from "react";

import {
  dockMounted,
  intakeNoticeCopy,
  intakeNoticeKind,
  resolveTalentChatGreeting,
  type TalentAskEntry,
} from "@/lib/talent/chat-entry";
import type { TalentSiteSwitches } from "@/lib/talent/site-switches";

import { TalentInquiryFormSheet } from "./TalentInquiryFormSheet";
import { TalentIntakeNotice } from "./TalentIntakeNotice";
import { TalentProfileChatLauncherMount } from "./TalentProfileChatLauncherMount";
import { ClientAccountDock } from "@/components/client-account/ClientAccountDock";

type LauncherProps = ComponentProps<typeof TalentProfileChatLauncherMount>;

/**
 * WSF D §8: everything the /t/ profile mounts for contact. The agency-level
 * guest chat settings gate first (enabled + showOnTalent); the talent's own
 * switches narrow on top: the chat dock, the inquiry form sheet (chat off), or
 * the honest intake notice.
 */
export function TalentIntakeSurfaces({
  askEntry,
  switches,
  agencyChatOn,
  agencyGreeting,
  launcher,
}: {
  askEntry: TalentAskEntry;
  switches: TalentSiteSwitches;
  agencyChatOn: boolean;
  agencyGreeting: string | null | undefined;
  launcher: Omit<LauncherProps, "greeting">;
}) {
  const notice = intakeNoticeKind(askEntry);
  const locale = launcher.locale ?? "en";
  return (
    <>
      <ClientAccountDock locale={locale} profileCode={launcher.talentProfileCode} />
      {notice ? (
        <TalentIntakeNotice text={intakeNoticeCopy(notice, locale)} closeLabel={locale === "es" ? "Cerrar" : "Close"} />
      ) : null}
      {agencyChatOn && askEntry === "form" && launcher.tenantSlug ? (
        <TalentInquiryFormSheet
          tenantSlug={launcher.tenantSlug}
          talentProfileId={launcher.talentProfileId}
          talentProfileCode={launcher.talentProfileCode}
          talentName={launcher.talentDisplayName}
          sourcePage={launcher.sourcePage}
          locale={locale}
          accentColor={launcher.accentColor}
        />
      ) : null}
      {agencyChatOn && dockMounted(askEntry) ? (
        <TalentProfileChatLauncherMount {...launcher} greeting={resolveTalentChatGreeting(switches, agencyGreeting ?? null)} />
      ) : null}
    </>
  );
}
