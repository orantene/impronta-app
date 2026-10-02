"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { clearPendingConversation, peekPendingConversation } from "@/components/admin/shell/internal/messages/conversation-pending";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { SellerChrome } from "@/components/messages-v5/shell/seller";
import { MessagesV5Shell } from "@/components/messages-v5/shell/MessagesV5Shell";
import { talentShellEngine } from "@/components/messages-v5/shell/talent-engine";
import type { ShellActionId } from "@/components/messages-v5/screens/contracts";

import { TalentMessagesShellLazy, useKeyboardInset } from "../../shared/client-threads-1";
import { MessagesFirstRun } from "./MessagesFirstRun";
import { openSendQuotePanel } from "../../agenda/SendQuotePanel";
import { MessagesSettingsDrawer } from "@/components/talent/money/MessagesSettingsDrawer";
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
  const [fromPin] = useState(() => peekPendingConversation());
  useEffect(() => {
    clearPendingConversation();
  }, []);
  const initialInquiryId = fromQuery ?? fromPin;
  const [activeId, setActiveId] = useState<string | null>(initialInquiryId);
  const dispatchRef = useRef<(id: ShellActionId) => void>(() => undefined);
  const copy = useDashboardText();
  // F54: the shell lists one segment at a time; the first run needs her total
  // across all of them. Re-read when the open thread changes (a new
  // conversation opens itself), so the first run leaves as soon as one exists.
  const [totalConversations, setTotalConversations] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void talentShellEngine.loadInbox({ locationSlug: "all", filter: "all" }).then((r) => {
      if (!cancelled) setTotalConversations(r.ok ? r.rows.length : null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);
  // Seller mode: a solo talent sees client, state and her own verbs, not staff chrome.
  const seller = useMemo<SellerChrome>(
    () => ({
      quoteSubtitle: copy.t("The client sees the services, the total and one Accept button."),
      summaryTitle: copy.t("What the client pays"),
      summaryTotal: copy.t("Services total"),
      summaryDeposit: copy.t("Deposit to hold the time"),
      summaryBalance: copy.t("Paid at the appointment"),
      // F37: the page is "Messages" in the rail and the mockup, not the staff "Inbox".
      inboxTitle: copy.t("Messages"),
      newConversation: copy.t("New conversation"),
      filters: { all: copy.t("All"), needs: copy.t("Needs reply"), quotes: copy.t("Quotes out"), agency: copy.t("Agency") },
      waitingOnYou: copy.t("{count} waiting on you"),
      firstRunTitle: copy.t("No messages yet"),
      firstRunBody: copy.t("Clients write to you from your page. Share your link and new conversations show up here. You can also start one with + New conversation."),
      firstRunAction: <MessagesFirstRun />,
      totalConversations,
    }),
    [copy, totalConversations],
  );
  const onDispatchReady = useCallback((dispatch: (id: ShellActionId) => void) => {
    dispatchRef.current = dispatch;
  }, []);

  return (
    <div
      data-talent-messages-v5
      className="-mx-[14px] -mt-[14px] -mb-[60px] flex h-[calc(100dvh-66px)] min-h-0 flex-col max-md:h-[calc(100dvh-115px-env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex shrink-0 justify-end px-2">
        <MessagesSettingsDrawer />
      </div>
      <TalentDecisionBar inquiryId={activeId} />
      <MessagesV5Shell
        tenantId={tenantId || "talent"}
        tenantSlug={bridgeTenantIdentity?.slug || "talent"}
        currentUserId={bridgeSessionIdentity?.userId ?? null}
        currentUserDisplayName={bridgeSessionIdentity?.displayName ?? null}
        workspaceType="talent"
        engine={talentShellEngine}
        live={Boolean(tenantId)}
        initialInquiryId={initialInquiryId}
        onActiveInquiry={setActiveId}
        onDispatchReady={onDispatchReady}
        seller={seller}
        composerAccessory={
          <div className="flex items-center justify-start gap-2 px-3 pb-1 pt-2" data-talent-seller-actions>
            <button
              type="button"
              onClick={() => openSendQuotePanel(activeId)}
              data-send-quote-open
              className="min-h-[44px] rounded-full border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink"
            >
              {copy.t("Send quote")}
            </button>
            <TalentSellerActions
              hasThread={Boolean(activeId)}
              onPick={(id) => {
                dispatchRef.current(SELLER_TO_SHELL[id]);
              }}
            />
          </div>
        }
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
