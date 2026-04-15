"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition, useState } from "react";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { InquiryMessageThread } from "@/components/inquiry/inquiry-message-thread";
import { EventLocationMap } from "@/components/inquiry/event-location-map";
import { InquiryTabErrorBoundary } from "@/components/inquiry/inquiry-tab-error-boundary";
import { Button } from "@/components/ui/button";
import { ADMIN_SECTION_TITLE_CLASS, CLIENT_PAGE_STACK_DETAIL, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import type { ProgressStepResult } from "@/lib/inquiry/inquiry-progress";
import type {
  InquiryWorkspaceApproval,
  InquiryWorkspaceRosterEntry,
  PrimaryAction,
  WorkspacePermissions,
} from "@/lib/inquiry/inquiry-workspace-types";
import { actionClientLoadOlderInquiryMessages } from "@/app/(dashboard)/client/inquiries/[id]/client-inquiry-messaging-actions";

const TABS = ["messages", "offer", "approvals"] as const;
export type ClientInquiryTab = (typeof TABS)[number];

function ClientOfferDecision({
  inquiryId,
  offerId,
  inquiryVersion,
  acceptAction,
  rejectAction,
  onDone,
}: {
  inquiryId: string;
  offerId: string;
  inquiryVersion: number;
  acceptAction: (fd: FormData) => Promise<ActionResult>;
  rejectAction: (fd: FormData) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (action: (fd: FormData) => Promise<ActionResult>, fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.message);
      } else {
        onDone();
      }
    });
  };

  return (
    <div className="space-y-3 border-t border-border/40 pt-4">
      <p className="text-sm font-medium text-foreground">Your response</p>
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(acceptAction, new FormData(e.currentTarget));
          }}
        >
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="offer_id" value={offerId} />
          <input type="hidden" name="expected_version" value={inquiryVersion} />
          <Button type="submit" disabled={isPending} className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}>
            {isPending ? "Submitting…" : "Accept offer"}
          </Button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(rejectAction, new FormData(e.currentTarget));
          }}
        >
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="offer_id" value={offerId} />
          <input type="hidden" name="expected_version" value={inquiryVersion} />
          <Button type="submit" disabled={isPending} variant="outline" className="rounded-full text-destructive hover:text-destructive">
            Decline offer
          </Button>
        </form>
      </div>
    </div>
  );
}

function ClientInquiryPrimaryAction({
  primaryAction,
  tabBasePath,
}: {
  primaryAction: PrimaryAction;
  tabBasePath: string;
}) {
  if (primaryAction.href) {
    return (
      <Button asChild className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}>
        <Link href={primaryAction.href}>{primaryAction.label}</Link>
      </Button>
    );
  }

  if (primaryAction.key === "send_message") {
    return (
      <Button asChild className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}>
        <Link href={`${tabBasePath}?tab=messages`} scroll={false}>
          {primaryAction.label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      disabled={primaryAction.disabled}
      title={primaryAction.disabledReason}
      className={cn(primaryAction.variant === "gold" && LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
    >
      {primaryAction.label}
    </Button>
  );
}

export function ClientInquiryWorkspace(props: {
  inquiryId: string;
  tabBasePath: string;
  activeTab: ClientInquiryTab;
  contactName: string | null;
  statusLabel: string;
  progress: ProgressStepResult;
  permissions: WorkspacePermissions;
  primaryAction: PrimaryAction;
  messages: { id: string; body: string; created_at: string; sender_user_id: string | null; sender_name: string | null; sender_avatar_url: string | null; metadata: Record<string, unknown> }[];
  messagesHasOlder: boolean;
  sendMessageAction: (fd: FormData) => Promise<ActionResult>;
  offer: null | {
    status: string;
    total_client_price: number;
    currency_code: string;
    lines: { label: string | null; units: number; unit_price: number; total_price: number }[];
  };
  offerId: string | null;
  inquiryVersion: number;
  eventLocation: string | null;
  eventDate: string | null;
  acceptOfferAction: (fd: FormData) => Promise<ActionResult>;
  rejectOfferAction: (fd: FormData) => Promise<ActionResult>;
  approvals: InquiryWorkspaceApproval[];
  roster: InquiryWorkspaceRosterEntry[];
}) {
  const router = useRouter();

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        href: `${props.tabBasePath}?tab=${t}`,
        label: t === "messages" ? "Messages" : t === "offer" ? "Offer" : "Approvals",
        active: props.activeTab === t,
      })),
    [props.activeTab, props.tabBasePath],
  );

  return (
    <div className={cn(CLIENT_PAGE_STACK_DETAIL, "space-y-6")}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/client/inquiries"
          scroll={false}
          className="flex items-center gap-1 hover:text-foreground hover:underline underline-offset-4"
        >
          ← Inquiries
        </Link>
      </nav>

      <DashboardPageHeader
        title={props.contactName ?? "Inquiry"}
        description={props.progress.message}
        below={
          <div className="flex flex-wrap items-center gap-2">
            <AdminCommercialStatusBadge kind="inquiry" status={props.statusLabel} />
            {!props.progress.isTerminal ? (
              <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                Step {props.progress.step}: {props.progress.label}
              </span>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <ClientInquiryPrimaryAction primaryAction={props.primaryAction} tabBasePath={props.tabBasePath} />
      </div>

      <nav aria-label="Inquiry sections" className="flex gap-1 overflow-x-auto border-b border-border/50 pb-px">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            scroll={false}
            className={cn(
              "shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
              t.active
                ? "border border-b-0 border-border/50 bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {props.activeTab === "messages" ? (
        <InquiryTabErrorBoundary tab="Messages" onRetry={() => router.refresh()}>
          {(props.eventLocation || props.eventDate) && (
            <DashboardSectionCard title="Event details" description="Your submitted request details." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
              <div className="space-y-3 text-sm">
                {props.eventDate ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="mt-0.5 font-medium">{props.eventDate}</p>
                  </div>
                ) : null}
                {props.eventLocation ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <div className="mt-1.5">
                      <EventLocationMap location={props.eventLocation} />
                    </div>
                  </div>
                ) : null}
              </div>
            </DashboardSectionCard>
          )}
          <DashboardSectionCard title="Messages" description="Private between you and the agency coordinator. Talent cannot see this thread." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
            <InquiryMessageThread
              inquiryId={props.inquiryId}
              threadType="private"
              initialMessages={props.messages}
              sendAction={props.sendMessageAction}
              allowCompose={props.permissions.canSendMessage}
              emptyHint={
                props.permissions.canSendMessage
                  ? undefined
                  : "Messaging is not available for this inquiry in its current state."
              }
              olderHistory={{
                hasOlder: props.messagesHasOlder,
                oldestCreatedAt: props.messages[0]?.created_at ?? null,
              }}
              loadOlderAction={actionClientLoadOlderInquiryMessages}
            />
          </DashboardSectionCard>
        </InquiryTabErrorBoundary>
      ) : null}

      {props.activeTab === "offer" ? (
        <InquiryTabErrorBoundary tab="Offer" onRetry={() => router.refresh()}>
          <DashboardSectionCard title="Offer" description="What the agency proposed." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
            {props.offer ? (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Status: <span className="font-medium capitalize text-foreground">{props.offer.status}</span>
                </p>
                <p>
                  Total:{" "}
                  <span className="font-semibold">
                    {props.offer.currency_code} {props.offer.total_client_price.toFixed(2)}
                  </span>
                </p>
                <ul className="space-y-2 rounded-xl border border-border/40 bg-muted/10 p-3">
                  {props.offer.lines.map((li, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 text-xs">
                      <span>{li.label ?? "Line item"}</span>
                      <span className="tabular-nums">
                        {li.units} × {props.offer!.currency_code} {li.unit_price.toFixed(2)} = {props.offer!.currency_code}{" "}
                        {li.total_price.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                {props.offer.status === "sent" && props.permissions.canApprove && props.offerId ? (
                  <ClientOfferDecision
                    inquiryId={props.inquiryId}
                    offerId={props.offerId}
                    inquiryVersion={props.inquiryVersion}
                    acceptAction={props.acceptOfferAction}
                    rejectAction={props.rejectOfferAction}
                    onDone={() => router.refresh()}
                  />
                ) : props.offer.status === "accepted" ? (
                  <p className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                    You have accepted this offer. The agency will be in touch to confirm next steps.
                  </p>
                ) : props.offer.status === "rejected" ? (
                  <p className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                    You declined this offer.
                  </p>
                ) : props.offer.status === "draft" ? (
                  <p className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                    The agency is still preparing this offer. You will be notified when it is ready for review.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No offer is linked to this inquiry yet.</p>
            )}
          </DashboardSectionCard>
        </InquiryTabErrorBoundary>
      ) : null}

      {props.activeTab === "approvals" ? (
        <InquiryTabErrorBoundary tab="Approvals" onRetry={() => router.refresh()}>
          <DashboardSectionCard
            title="Approvals"
            description="Confirmations for the current offer."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="mb-3 text-sm text-muted-foreground">{props.progress.message}</p>
            {props.approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approval rows yet — they appear after the agency sends an offer.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {props.approvals.map((a, i) => {
                  const rosterEntry = props.roster.find((r) => r.id === a.participant_id);
                  // Unmatched = client's own approval row (roster only loads talent participants)
                  const label = rosterEntry
                    ? rosterEntry.display_name ?? rosterEntry.profile_code
                    : "You";
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap justify-between gap-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-2"
                    >
                      <span className="text-sm text-foreground">{label}</span>
                      <AdminCommercialStatusBadge kind="inquiry" status={a.status} className="text-xs capitalize" />
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardSectionCard>
        </InquiryTabErrorBoundary>
      ) : null}
    </div>
  );
}
