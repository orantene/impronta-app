"use client";

/**
 * messages-client.tsx — the Messages & Inquiries view of every POS mode
 * (`docs/plans/program/engine/messaging.md`, seam 2).
 *
 * `MessagesClient` is the package's own mount point. `MessagesModeClient`
 * is what the route renders for `?view=messages`: the mode's own `PosFrame`
 * (its rail, its chip, its lock and workspace doors) with the Messages
 * surface where the mode's screen would be, and the rail's `messages` row
 * pressed. Pressing any other row leaves the view for that mode's landing
 * screen; the "Back to sale #N · $X · N lines" / "Back to Today" link in the
 * surface's header does the same thing by name. At the phone breakpoint the
 * surface renders `compact` (MM01 to MM06, seam 5).
 */

import { useRouter } from "next/navigation";

import { PosFrame } from "@/components/admin/pos/PosFrame";
import { MessagesShell, type MessagesClientProps } from "@/components/admin/pos/messages/MessagesShell";
import { useCompactViewport } from "@/components/admin/pos/messages/use-compact-viewport";
import { PosMessagesDock } from "@/components/messages-v5/pos/PosMessagesDock";
import { POS_MESSAGES_DESTINATION, posMessagesHref, type PosMode } from "@/lib/pos/modes";

export type { MessagesClientProps };

/** Mount point the integrator renders inside PosFrame when ?view=messages. */
export function MessagesClient(props: MessagesClientProps) {
  return <MessagesShell {...props} />;
}

export type MessagesModeClientProps = {
  readonly mode: PosMode;
  readonly tenantId: string;
  /** L10: `MessagesV5Shell` needs both id and slug. */
  readonly tenantSlug: string;
  readonly locationSlug: string;
  readonly adminBasePath: string;
  /** Where the header's back link goes: the mode's landing screen, with the counter's open sale. */
  readonly returnHref: string;
  readonly returnLabel: string;
  /** The inbox's unread count: the rail's `messages` badge (seam 10). */
  readonly messagesUnread: number;
  /** L10: the signed-in person, for the v5 shell's message attribution. Null when nobody is (never renders past the route guard, but the type stays honest). */
  readonly currentUserId: string | null;
  /** L10: the counter's open sale, for the dock's "This client" view and the sale-summary pane. Null with no sale open. */
  readonly openOrderId: string | null;
  /** L10: the conversation already linked to `openOrderId`, resolved server-side (`messagingLoadInbox`, no new reader). Null with no sale, no flag, or no thread yet. */
  readonly initialCustomerInquiryId: string | null;
  readonly frame: {
    readonly navLabel: string;
    readonly destinationLabels: Readonly<Record<string, string>>;
    readonly modeLabel: string;
    readonly modeEyebrow: string;
    readonly lock: string;
    readonly lockUnavailable: string;
    readonly workspace: string;
  };
  readonly workspacePath: string;
};

export function MessagesModeClient(props: MessagesModeClientProps) {
  const router = useRouter();
  const compact = useCompactViewport();
  return (
    <div className="relative flex h-[calc(100vh-var(--proto-cbar,50px))] min-h-[560px] w-full flex-col overflow-hidden" data-tulala-pos-chrome>
      <PosFrame
        mode={props.mode}
        navLabel={props.frame.navLabel}
        activeDestination={POS_MESSAGES_DESTINATION}
        onSelectDestination={(id) => {
          // The row is already pressed; every other row is that mode's own
          // screen, which the mode's client decides once the view is gone.
          router.push(id === POS_MESSAGES_DESTINATION ? posMessagesHref(props.mode) : `?mode=${props.mode}`);
        }}
        destinationLabels={props.frame.destinationLabels}
        counts={{ messages: props.messagesUnread }}
        modeLabel={props.frame.modeLabel}
        modeEyebrow={props.frame.modeEyebrow}
        lock={{ label: props.frame.lock, disabledReason: props.frame.lockUnavailable }}
        workspace={{ label: props.frame.workspace, href: props.workspacePath }}
        className="flex-1 rounded-none border-0"
      >
        {process.env.NEXT_PUBLIC_MESSAGES_V5 === "1" ? (
          // Messages v5 (L10): the dock beside the sale / drawer over it,
          // rather than a full-screen replacement of the mode's own PosFrame
          // content. Behind the same env flag L2 used for the workspace
          // inbox; Phase 3 replaces this with the per-tenant `messages_v5`
          // flag (owner decision 10) at both call sites.
          <PosMessagesDock
            tenantId={props.tenantId}
            tenantSlug={props.tenantSlug}
            locationSlug={props.locationSlug}
            adminBasePath={props.adminBasePath}
            currentUserId={props.currentUserId}
            returnHref={props.returnHref}
            returnLabel={props.returnLabel}
            openOrderId={props.openOrderId}
            initialCustomerInquiryId={props.initialCustomerInquiryId}
          />
        ) : (
          <MessagesClient
            mode={props.mode}
            tenantId={props.tenantId}
            locationSlug={props.locationSlug}
            adminBasePath={props.adminBasePath}
            returnHref={props.returnHref}
            returnLabel={props.returnLabel}
            compact={compact}
          />
        )}
      </PosFrame>
    </div>
  );
}
