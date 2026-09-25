"use client";

import { useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { MessagesV5Shell } from "@/components/messages-v5/shell/MessagesV5Shell";
import { talentShellEngine } from "@/components/messages-v5/shell/talent-engine";

import { TalentMessagesShellLazy, useKeyboardInset } from "../../shared/client-threads-1";
import { TalentDecisionBar } from "./TalentDecisionBar";
import { TalentSellerActions } from "@/components/talent/studio/TalentSellerActions";
import { useTalentStudioV2 } from "@/components/talent/studio/flag";

function TalentMessagesV5() {
  const { bridgeTenantIdentity, bridgeSessionIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? "";
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <div
      data-talent-messages-v5
      className="-mx-[14px] -mt-[14px] -mb-[60px] flex h-[calc(100dvh-66px)] min-h-0 flex-col max-md:h-[calc(100dvh-115px-env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        <TalentSellerActions />
      </div>
      <TalentDecisionBar inquiryId={activeId} />
      <MessagesV5Shell
        tenantId={tenantId || "talent"}
        tenantSlug={bridgeTenantIdentity?.slug || "talent"}
        currentUserId={bridgeSessionIdentity?.userId ?? null}
        workspaceType="talent"
        engine={talentShellEngine}
        live={Boolean(tenantId)}
        onActiveInquiry={setActiveId}
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
