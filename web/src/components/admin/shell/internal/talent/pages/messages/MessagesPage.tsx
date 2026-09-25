"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { consumePendingConversation } from "@/components/admin/shell/internal/messages/conversation-pending";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { MessagesV5Shell } from "@/components/messages-v5/shell/MessagesV5Shell";
import { talentShellEngine } from "@/components/messages-v5/shell/talent-engine";
import type { ShellActionId } from "@/components/messages-v5/screens/contracts";

import { TalentMessagesShellLazy, useKeyboardInset } from "../../shared/client-threads-1";
import { TalentDecisionBar } from "./TalentDecisionBar";
import {
  TalentSellerActions,
  type TalentSellerActionId,
} from "@/components/talent/studio/TalentSellerActions";
import { useTalentStudioV2 } from "@/components/talent/studio/flag";

const SELLER_TO_SHELL: Record<TalentSellerActionId, ShellActionId> = {
  quote: "create_offer",
  time: "send_times",
  deposit: "request_payment",
  file: "send_file",
  note: "add_note",
  client: "open_client",
};

function TalentMessagesV5() {
  const { bridgeTenantIdentity, bridgeSessionIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? "";
  const searchParams = useSearchParams();
  // Match admin InboxPage: `/talent/inbox?inquiry=<uuid>` deep links.
  const linkedInquiry = searchParams.get("inquiry");
  const fromQuery =
    linkedInquiry && /^[0-9a-f-]{36}$/i.test(linkedInquiry) ? linkedInquiry : null;
  // `/talent/inbox/[id]` PinThenRedirect pins then replaces to /talent/inbox.
  const [fromPin] = useState(() => consumePendingConversation());
  const initialInquiryId = fromQuery ?? fromPin;
  const [activeId, setActiveId] = useState<string | null>(initialInquiryId);
  const dispatchRef = useRef<(id: ShellActionId) => void>(() => undefined);
  const onDispatchReady = useCallback((dispatch: (id: ShellActionId) => void) => {
    dispatchRef.current = dispatch;
  }, []);

  return (
    <div
      data-talent-messages-v5
      className="-mx-[14px] -mt-[14px] -mb-[60px] flex h-[calc(100dvh-66px)] min-h-0 flex-col max-md:h-[calc(100dvh-115px-env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        <TalentSellerActions
          disabledReason={activeId ? null : "Pick a conversation first"}
          onPick={(id) => {
            dispatchRef.current(SELLER_TO_SHELL[id]);
          }}
        />
      </div>
      <TalentDecisionBar inquiryId={activeId} />
      <MessagesV5Shell
        tenantId={tenantId || "talent"}
        tenantSlug={bridgeTenantIdentity?.slug || "talent"}
        currentUserId={bridgeSessionIdentity?.userId ?? null}
        workspaceType="talent"
        engine={talentShellEngine}
        live={Boolean(tenantId)}
        initialInquiryId={initialInquiryId}
        onActiveInquiry={setActiveId}
        onDispatchReady={onDispatchReady}
      />
    </div>
  );
}

export function TalentMessagesPage() {
  useKeyboardInset();
  const studio = useTalentStudioV2();
  if (studio || process.env.NEXT_PUBLIC_MESSAGES_V5 === "1") return <TalentMessagesV5 />;
  return <TalentMessagesShellLazy pov="talent" />;
}
