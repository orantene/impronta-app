"use client";

import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";
import { InquiryMessageThread } from "@/components/inquiry/inquiry-message-thread";
import { EventLocationMap } from "@/components/inquiry/event-location-map";
import { UserAvatar } from "@/components/ui/user-avatar";
import { InquiryTabErrorBoundary } from "@/components/inquiry/inquiry-tab-error-boundary";
import { InquiryV2OfferEditor } from "@/app/(dashboard)/admin/inquiries/[id]/inquiry-v2-offer-editor";
import {
  InquiryConvertBookingPanel,
  INQUIRY_ENGINE_CONVERT_FORM_ID,
} from "@/app/(dashboard)/admin/inquiries/[id]/inquiry-convert-booking";
import {
  actionLoadOlderInquiryMessages,
  actionMarkInquiryThreadRead,
} from "@/app/(dashboard)/admin/inquiries/[id]/messaging-actions";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import type { ActivityUiEntry } from "@/lib/commercial-activity-summary";
import type { OfferLineDraft } from "@/lib/inquiry/inquiry-engine";
import type {
  InquiryTab,
  InquiryWorkspaceApproval,
  InquiryWorkspaceInquiry,
  InquiryWorkspaceMessage,
  InquiryWorkspaceOffer,
  InquiryWorkspaceRosterEntry,
  PrimaryAction,
  WorkspacePermissions,
} from "@/lib/inquiry/inquiry-workspace-types";
import type { ProgressStepResult } from "@/lib/inquiry/inquiry-progress";
import { computeOfferWarnings, type OfferWarning } from "@/lib/inquiry/inquiry-soft-warnings";
import { handleActionResult, type ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { logServerError } from "@/lib/server/safe-error";
import { actionSendOffer } from "@/app/(dashboard)/admin/inquiries/[id]/offer-actions";

function AdminInquiryPrimaryActionButton(props: {
  primaryAction: PrimaryAction;
  inquiryId: string;
  inquiryVersion: number;
  tabBasePath: string;
  draftOffer: { id: string; version: number } | null;
  startReviewAction: (formData: FormData) => Promise<ActionResult>;
  reopenAction: (formData: FormData) => Promise<ActionResult>;
  createOfferAction: (formData: FormData) => Promise<ActionResult<{ offerId: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const feedback = (result: ActionResult) => {
    handleActionResult(result, {
      onToast: (m) => toast.message(m),
      onRefresh: () => router.refresh(),
      onInlineError: (m) => toast.error(m),
      onBlockerBanner: (m) => toast.error(m),
    });
  };

  const run = (fn: () => Promise<ActionResult<unknown>>) => {
    startTransition(() => {
      void fn().then((r) => feedback(r as ActionResult));
    });
  };

  const { primaryAction } = props;

  if (primaryAction.href) {
    return (
      <Button asChild className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}>
        <Link href={primaryAction.href}>{primaryAction.label}</Link>
      </Button>
    );
  }

  if (primaryAction.key === "convert_booking") {
    if (primaryAction.disabled) {
      return (
        <Button
          type="button"
          disabled
          title={primaryAction.disabledReason}
          className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
        >
          {primaryAction.label}
        </Button>
      );
    }
    return (
      <Button
        type="submit"
        form={INQUIRY_ENGINE_CONVERT_FORM_ID}
        disabled={pending}
        className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
      >
        {primaryAction.label}
      </Button>
    );
  }

  if (primaryAction.key === "start_review" && !primaryAction.disabled) {
    return (
      <Button
        type="button"
        disabled={pending}
        className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
        onClick={() => {
          const fd = new FormData();
          fd.set("inquiry_id", props.inquiryId);
          fd.set("expected_version", String(props.inquiryVersion));
          run(() => props.startReviewAction(fd));
        }}
      >
        {primaryAction.label}
      </Button>
    );
  }

  if (primaryAction.key === "reopen" && !primaryAction.disabled) {
    return (
      <Button
        type="button"
        disabled={pending}
        className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
        onClick={() => {
          const fd = new FormData();
          fd.set("inquiry_id", props.inquiryId);
          fd.set("expected_version", String(props.inquiryVersion));
          run(() => props.reopenAction(fd));
        }}
      >
        {primaryAction.label}
      </Button>
    );
  }

  if (primaryAction.key === "send_offer") {
    const d = props.draftOffer;
    if (!d || primaryAction.disabled) {
      return (
        <Button
          type="button"
          disabled
          title={primaryAction.disabledReason}
          className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
        >
          {primaryAction.label}
        </Button>
      );
    }
    return (
      <Button
        type="button"
        disabled={pending}
        className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
        onClick={() => {
          const fd = new FormData();
          fd.set("inquiry_id", props.inquiryId);
          fd.set("offer_id", d.id);
          fd.set("inquiry_version", String(props.inquiryVersion));
          fd.set("offer_version", String(d.version));
          run(() => actionSendOffer(fd));
        }}
      >
        {primaryAction.label}
      </Button>
    );
  }

  if (primaryAction.key === "create_offer" && !primaryAction.disabled) {
    return (
      <Button
        type="button"
        disabled={pending}
        className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
        onClick={() => {
          const fd = new FormData();
          fd.set("inquiry_id", props.inquiryId);
          fd.set("expected_version", String(props.inquiryVersion));
          run(() => props.createOfferAction(fd));
        }}
      >
        {primaryAction.label}
      </Button>
    );
  }

  if (primaryAction.key === "send_message") {
    return (
      <Button
        asChild
        className={cn(primaryAction.variant === "gold" && LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
      >
        <Link href={`${props.tabBasePath}?tab=messages`} scroll={false}>
          {primaryAction.label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      disabled={primaryAction.disabled || pending}
      title={primaryAction.disabledReason}
      className={cn(primaryAction.variant === "gold" && LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
    >
      {primaryAction.label}
    </Button>
  );
}

function CreateDraftOfferInline(props: {
  inquiryId: string;
  inquiryVersion: number;
  createOfferAction: (formData: FormData) => Promise<ActionResult<{ offerId: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("inquiry_id", props.inquiryId);
          fd.set("expected_version", String(props.inquiryVersion));
          startTransition(() => {
            void props.createOfferAction(fd).then((result) =>
              handleActionResult(result, {
                onToast: (m) => toast.message(m),
                onRefresh: () => router.refresh(),
                onInlineError: (m) => toast.error(m),
                onBlockerBanner: (m) => toast.error(m),
              }),
            );
          });
        }}
      >
        {pending ? "Creating…" : "Create draft offer"}
      </Button>
      <p className="text-xs text-muted-foreground">Creates an empty draft linked as the current offer.</p>
    </div>
  );
}

export type AdminInquiryWorkspaceV2Props = {
  inquiryId: string;
  inquiryVersion: number;
  statusLabel: string;
  workspaceInquiry: InquiryWorkspaceInquiry;
  sourceChannelLabel: string;
  staffLabel: string;
  contactName: string | null;
  contactAvatarUrl: string | null;
  company: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  eventLocation: string | null;
  nBookings: number;
  nTalent: number;
  locationName: string | null;
  locationSummary: string | null;
  activeTab: InquiryTab;
  tabBasePath: string;
  isLocked: boolean;
  permissions: WorkspacePermissions;
  primaryAction: PrimaryAction;
  progress: ProgressStepResult;
  roster: InquiryWorkspaceRosterEntry[];
  offer: InquiryWorkspaceOffer | null;
  offerLines: OfferLineDraft[];
  approvals: InquiryWorkspaceApproval[];
  messagesPrivate: InquiryWorkspaceMessage[];
  messagesGroup: InquiryWorkspaceMessage[];
  messagesPrivateHasOlder: boolean;
  messagesGroupHasOlder: boolean;
  activityEntries: ActivityUiEntry[];
  bookings: { id: string; title: string; status: string }[];
  convertTalents: { talent_profile_id: string; profile_code: string; display_name: string | null }[];
  existingBookingsForConvert: { id: string; title: string; status: string }[];
  defaultBookingTitle: string;
  sendMessageAction: (formData: FormData) => Promise<ActionResult>;
  createOfferAction: (formData: FormData) => Promise<ActionResult<{ offerId: string }>>;
  startReviewAction: (formData: FormData) => Promise<ActionResult>;
  reopenAction: (formData: FormData) => Promise<ActionResult>;
  /** Latest message id per thread — used for mark-as-read (SC-13). */
  lastPrivateMessageId: string | null;
  lastGroupMessageId: string | null;
  /** Server-rendered admin edit forms rendered inside the Details tab. */
  detailsContent?: React.ReactNode;
};

export function AdminInquiryWorkspaceV2(props: AdminInquiryWorkspaceV2Props) {
  const router = useRouter();
  const [thread, setThread] = useState<"private" | "group">("private");
  /** At most one successful mark per (thread, lastMessageId) while this mount lives (SC-13). */
  const markedThreadKeys = useRef<Set<string>>(new Set());

  const warnings = useMemo(
    () =>
      computeOfferWarnings({
        inquiry: props.workspaceInquiry,
        offer: props.offer,
        roster: props.roster,
      }),
    [props.workspaceInquiry, props.offer, props.roster],
  );

  const tabs = useMemo(
    () =>
      (["messages", "offer", "approvals", "history", "details"] as const).map((t) => ({
        href: `${props.tabBasePath}?tab=${t}`,
        label:
          t === "messages" ? "Messages"
          : t === "offer" ? "Offer"
          : t === "approvals" ? "Approvals"
          : t === "history" ? "History"
          : "Details",
        active: props.activeTab === t,
      })),
    [props.activeTab, props.tabBasePath],
  );

  const draftOfferForPrimary =
    props.offer?.status === "draft" ? { id: props.offer.id, version: props.offer.version } : null;

  useEffect(() => {
    if (props.activeTab !== "messages") return;
    const lastId = thread === "private" ? props.lastPrivateMessageId : props.lastGroupMessageId;
    if (!lastId) return;
    const dedupeKey = `${thread}:${lastId}`;
    if (markedThreadKeys.current.has(dedupeKey)) return;

    const run = () => {
      if (markedThreadKeys.current.has(dedupeKey)) return;
      markedThreadKeys.current.add(dedupeKey);
      const fd = new FormData();
      fd.set("inquiry_id", props.inquiryId);
      fd.set("thread_type", thread);
      fd.set("last_message_id", lastId);
      void actionMarkInquiryThreadRead(fd).then((r) => {
        if (!r.ok) {
          markedThreadKeys.current.delete(dedupeKey);
          logServerError("admin/inquiry/mark-thread-read", new Error(r.message));
        }
      });
    };

    const t = window.setTimeout(run, 1600);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        window.clearTimeout(t);
        run();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [props.activeTab, props.inquiryId, props.lastGroupMessageId, props.lastPrivateMessageId, thread]);

  return (
    <div className={cn(ADMIN_PAGE_STACK, "gap-6")}>
      {props.isLocked ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          This inquiry is <strong>{props.workspaceInquiry.status}</strong>. Some actions are read-only.
        </div>
      ) : null}

      {/* Progress + header */}
      <div className="rounded-2xl border border-border/45 bg-card/60 px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <AdminCommercialStatusBadge kind="inquiry" status={props.statusLabel} className="px-3 py-1 text-sm" />
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {props.sourceChannelLabel}
          </span>
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {props.staffLabel}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{props.progress.message}</p>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
          {props.contactName || "Unnamed inquiry"}
        </h1>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {props.company ? <span className="font-medium text-foreground/80">{props.company}</span> : null}
          {props.contactEmail ? <span>{props.contactEmail}</span> : null}
          {props.contactPhone ? <span>{props.contactPhone}</span> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminInquiryPrimaryActionButton
            primaryAction={props.primaryAction}
            inquiryId={props.inquiryId}
            inquiryVersion={props.inquiryVersion}
            tabBasePath={props.tabBasePath}
            draftOffer={draftOfferForPrimary}
            startReviewAction={props.startReviewAction}
            reopenAction={props.reopenAction}
            createOfferAction={props.createOfferAction}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <AdminPageTabs ariaLabel="Inquiry workspace" items={tabs} />

          {props.activeTab === "messages" ? (
            <InquiryTabErrorBoundary tab="Messages" onRetry={() => router.refresh()}>
              <DashboardSectionCard
                title="Messages"
                description="Switch between threads using the buttons below."
                titleClassName={ADMIN_SECTION_TITLE_CLASS}
              >
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setThread("private")}
                    className={cn(
                      "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                      thread === "private"
                        ? "border-foreground/20 bg-foreground/5 text-foreground"
                        : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    <span className="text-sm font-medium">Private</span>
                    <span className="text-[11px] opacity-70">You + client only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThread("group")}
                    className={cn(
                      "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                      thread === "group"
                        ? "border-foreground/20 bg-foreground/5 text-foreground"
                        : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    <span className="text-sm font-medium">Team</span>
                    <span className="text-[11px] opacity-70">Agency + all talent · client cannot see</span>
                  </button>
                </div>
                <InquiryMessageThread
                  inquiryId={props.inquiryId}
                  threadType={thread}
                  initialMessages={thread === "private" ? props.messagesPrivate : props.messagesGroup}
                  sendAction={props.sendMessageAction}
                  allowCompose={props.permissions.canSendMessage}
                  emptyHint={
                    props.permissions.canSendMessage
                      ? undefined
                      : "No messages were sent during this inquiry."
                  }
                  olderHistory={{
                    hasOlder: thread === "private" ? props.messagesPrivateHasOlder : props.messagesGroupHasOlder,
                    oldestCreatedAt:
                      (thread === "private" ? props.messagesPrivate[0] : props.messagesGroup[0])?.created_at ??
                      null,
                  }}
                  loadOlderAction={actionLoadOlderInquiryMessages}
                />
              </DashboardSectionCard>
            </InquiryTabErrorBoundary>
          ) : null}

          {props.activeTab === "offer" ? (
            <InquiryTabErrorBoundary tab="Offer" onRetry={() => router.refresh()}>
              <DashboardSectionCard
                title="Offer"
                description="Structured commercial proposal."
                titleClassName={ADMIN_SECTION_TITLE_CLASS}
              >
                {warnings.length > 0 ? (
                  <div className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-50">
                    {(warnings as OfferWarning[]).includes("details_changed") ? (
                      <p>Inquiry details may have changed since the draft was saved.</p>
                    ) : null}
                  </div>
                ) : null}
                {props.offer ? (
                  <InquiryV2OfferEditor
                    inquiryId={props.inquiryId}
                    inquiryVersion={props.inquiryVersion}
                    offer={{
                      id: props.offer.id,
                      version: props.offer.version,
                      status: props.offer.status,
                      total_client_price: props.offer.total_client_price,
                      coordinator_fee: props.offer.coordinator_fee,
                      currency_code: props.offer.currency_code,
                      notes: props.offer.notes,
                    }}
                    initialLines={props.offerLines}
                  />
                ) : props.permissions.canCreateOffer ? (
                  <CreateDraftOfferInline
                    inquiryId={props.inquiryId}
                    inquiryVersion={props.inquiryVersion}
                    createOfferAction={props.createOfferAction}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Offer actions are not available yet for this inquiry state.
                  </p>
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
                    {props.approvals.map((a) => {
                      const rosterEntry = props.roster.find((r) => r.id === a.participant_id);
                      const label = rosterEntry
                        ? (rosterEntry.display_name ?? rosterEntry.profile_code)
                        : "Client";
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

          {props.activeTab === "history" ? (
            <InquiryTabErrorBoundary tab="History" onRetry={() => router.refresh()}>
              <div className="max-h-[32rem] overflow-y-auto rounded-2xl border border-border/50 bg-muted/10 p-4">
                <ul className="space-y-3">
                  {props.activityEntries.map((e) => (
                    <li key={e.id} className="rounded-lg border border-border/45 bg-background/80 px-3 py-2 text-sm">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time>
                        <span>{e.actor_label}</span>
                      </div>
                      <p className="mt-1 font-medium">{e.label}</p>
                    </li>
                  ))}
                </ul>
                {props.bookings.length > 0 ? (
                  <div className="mt-6 border-t border-border/40 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked bookings</p>
                    <ul className="mt-2 space-y-2">
                      {props.bookings.map((b) => (
                        <li key={b.id}>
                          <Link href={`/admin/bookings/${b.id}`} className="text-[var(--impronta-gold)] hover:underline">
                            {b.title}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">{b.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </InquiryTabErrorBoundary>
          ) : null}

          {props.activeTab === "details" && props.detailsContent ? (
            <InquiryTabErrorBoundary tab="Details" onRetry={() => router.refresh()}>
              {props.detailsContent}
            </InquiryTabErrorBoundary>
          ) : null}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <DashboardSectionCard title="Client" description="Requester" titleClassName={ADMIN_SECTION_TITLE_CLASS}>
            <div className="flex items-center gap-3">
              <UserAvatar src={props.contactAvatarUrl} name={props.contactName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{props.contactName ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{props.contactEmail ?? ""}</p>
              </div>
            </div>
          </DashboardSectionCard>
          <DashboardSectionCard title="Location" description="Venue / account" titleClassName={ADMIN_SECTION_TITLE_CLASS}>
            <p className="text-sm font-medium">{props.locationName ?? "—"}</p>
            {props.locationSummary ? (
              <p className="text-xs text-muted-foreground">{props.locationSummary}</p>
            ) : null}
            {props.eventLocation ? (
              <div className="mt-3 border-t border-border/40 pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Event venue</p>
                <EventLocationMap location={props.eventLocation} />
              </div>
            ) : null}
          </DashboardSectionCard>
          <DashboardSectionCard title="Talent" description="Shortlist" titleClassName={ADMIN_SECTION_TITLE_CLASS}>
            <p className="text-2xl font-semibold tabular-nums">{props.nTalent}</p>
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {props.roster.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <UserAvatar src={r.image_url} name={r.display_name ?? r.profile_code} size="xs" rounded="xl" />
                  <span className="truncate text-xs">
                    {r.profile_code}
                    {r.display_name ? ` · ${r.display_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </DashboardSectionCard>
        </aside>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-30 border-t border-border/50 bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Bookings linked: <span className="font-medium text-foreground">{props.nBookings}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminInquiryPrimaryActionButton
              primaryAction={props.primaryAction}
              inquiryId={props.inquiryId}
              inquiryVersion={props.inquiryVersion}
              tabBasePath={props.tabBasePath}
              draftOffer={draftOfferForPrimary}
              startReviewAction={props.startReviewAction}
              reopenAction={props.reopenAction}
              createOfferAction={props.createOfferAction}
            />
          </div>
        </div>
      </div>

      {/* Convert booking — always reachable below tabs */}
      {!props.isLocked || props.workspaceInquiry.status === "approved" ? (
        <InquiryConvertBookingPanel
          inquiryId={props.inquiryId}
          defaultTitle={props.defaultBookingTitle}
          talents={props.convertTalents}
          existingBookings={props.existingBookingsForConvert}
          engineV2
          inquiryVersion={props.inquiryVersion}
        />
      ) : null}
    </div>
  );
}
