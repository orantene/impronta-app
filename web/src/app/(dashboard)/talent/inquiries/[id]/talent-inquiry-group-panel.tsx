"use client";

import { useRouter } from "next/navigation";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { InquiryMessageThread } from "@/components/inquiry/inquiry-message-thread";
import { InquiryTabErrorBoundary } from "@/components/inquiry/inquiry-tab-error-boundary";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import {
  actionTalentLoadOlderGroupMessages,
  type TalentGroupMessageDto,
} from "@/app/(dashboard)/talent/inquiries/[id]/talent-inquiry-messaging-actions";

export function TalentInquiryGroupPanel(props: {
  inquiryId: string;
  initialMessages: TalentGroupMessageDto[];
  messagesHasOlder: boolean;
  sendAction: (fd: FormData) => Promise<ActionResult>;
  allowCompose: boolean;
}) {
  const router = useRouter();
  return (
    <InquiryTabErrorBoundary tab="Group thread" onRetry={() => router.refresh()}>
      <DashboardSectionCard
        title="Team thread"
        description="Visible to the agency coordinator and all talent on this inquiry. Clients do not see this thread."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <InquiryMessageThread
          inquiryId={props.inquiryId}
          threadType="group"
          initialMessages={props.initialMessages}
          sendAction={props.sendAction}
          allowCompose={props.allowCompose}
          emptyHint={
            props.allowCompose
              ? "No group messages yet. You can post here when you are ready."
              : "Group messaging is not available for this inquiry in its current state."
          }
          olderHistory={{
            hasOlder: props.messagesHasOlder,
            oldestCreatedAt: props.initialMessages[0]?.created_at ?? null,
          }}
          loadOlderAction={actionTalentLoadOlderGroupMessages}
        />
      </DashboardSectionCard>
    </InquiryTabErrorBoundary>
  );
}
