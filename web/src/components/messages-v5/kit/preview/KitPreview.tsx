"use client";

/**
 * KitPreview (dev only): every kit component in every state at three
 * container widths (390 mobile kit, 1194 tablet, 1440 desktop) on one
 * scrollable page. Route: /c/t/preview?kit=1 (non-production only). The
 * integrator screenshots this against boards D01/D05/D07/M02/M03/M05.
 *
 * Fixture data is labelled example data in USD; nothing here reads a tenant.
 */

import type { ReactNode } from "react";

import type { DerivedTask, InboxRow, InquiryMessagingState, RecordChip, ThreadMessage } from "@/lib/messaging/types";

import { AppointmentCard } from "../AppointmentCard";
import { ChangeRequestCard } from "../ChangeRequestCard";
import { Composer, type ComposerState } from "../Composer";
import type { KitCopy } from "../copy";
import { EssentialsStrip } from "../EssentialsStrip";
import { IdentityCaptureCard, type IdentityCaptureState } from "../IdentityCaptureCard";
import { InboxRowV5 } from "../InboxRowV5";
import { FilterChips, FilterSheet, InboxSegments } from "../InboxSegments";
import { LineEditorRow } from "../LineEditor";
import { DaySeparator, MessageBubble, SystemLine, UnreadDivider } from "../MessageBubble";
import { NextStepBar, NextStepBlock } from "../NextStep";
import { OfferCard, type OfferCardState } from "../OfferCard";
import { OptionRow } from "../OptionRow";
import { OrderCard } from "../OrderCard";
import { PanelSection, SummaryBlock } from "../Panel";
import { PaymentCard, type PaymentCardState } from "../PaymentCard";
import { PaymentLadder, paymentLadderSteps } from "../PaymentLadder";
import { Avatar, Btn, Chip, Pill, type PillTone } from "../primitives";
import { AlertLine, OkLine, RefusalLine } from "../RefusalLine";
import { Sheet } from "../Sheet";
import { EmptyState, Skeleton } from "../Skeleton";
import { StateTags } from "../StateTags";
import { ThreadHeader } from "../ThreadHeader";
import { TimesCard } from "../TimesCard";
import { Tray, defaultTrayGroups } from "../Tray";
import { useKitCopy } from "../use-kit-copy";

import "../tokens.css";

const noop = () => {};
const NOW = new Date("2026-09-17T12:00:00Z");

const CHIP_OFFER: RecordChip = { kind: "offer", recordId: "iq-512", label: "Offer v2 · $3,800", paymentState: null, fulfilmentState: null };
const CHIP_ORDER: RecordChip = { kind: "order", recordId: "or-1203", label: "#1203 · $48.50", paymentState: "paid", fulfilmentState: "preparing" };
const CHIP_APPT: RecordChip = { kind: "appointment", recordId: "ap-2041", label: "AP-2041 · Sat 11:00", paymentState: "deposit_paid", fulfilmentState: "confirmed" };
const CHIP_TICKETS: RecordChip = { kind: "tickets", recordId: "tk-1", label: "4 × Friday show", paymentState: "paid", fulfilmentState: null };

const S_NEEDS: InquiryMessagingState = { conversation: "needs_reply", opportunity: "awaiting_acceptance", records: [{ kind: "offer", recordId: "iq-512" }] };
const S_WAIT: InquiryMessagingState = { conversation: "awaiting_customer", opportunity: "won", records: [{ kind: "order", recordId: "or-1203" }] };
const S_RESOLVED: InquiryMessagingState = { conversation: "resolved", opportunity: "lost", records: [] };
const S_BARE: InquiryMessagingState = { conversation: "needs_reply", opportunity: null, records: [] };

function row(over: Partial<InboxRow>): InboxRow {
  return {
    id: "inq-1",
    tenantId: "t",
    locationSlug: "impronta",
    contactName: "Valentina Ruiz",
    contactPhone: null,
    contactEmail: null,
    conversationState: "needs_reply",
    opportunityState: "awaiting_acceptance",
    channel: "web_chat",
    ownerUserId: "u-sofia",
    ownerLabel: "Sofía H.",
    unread: true,
    unreadCount: 2,
    subject: "Beach wedding · Tulum · Aug 14",
    lastMessagePreview: "Can we add a second DJ set after dinner?",
    nextAction: "reply",
    lastCustomerMessageAt: "2026-09-17T11:58:00Z",
    lastStaffMessageAt: null,
    updatedAt: "2026-09-17T11:58:00Z",
    version: 1,
    recordChips: [CHIP_OFFER],
    ...over,
  };
}

const ROWS: InboxRow[] = [
  row({}),
  row({ id: "inq-2", contactName: "", subject: "Table for 6 on Friday?", lastMessagePreview: "Do you have a table for 6 around 8pm Friday?", opportunityState: null, ownerUserId: null, ownerLabel: null, unreadCount: 1, recordChips: [], lastCustomerMessageAt: "2026-09-17T11:54:00Z" }),
  row({ id: "inq-3", contactName: "Grupo Sol · Andrés", channel: "email", subject: "Team offsite · 12 seats yoga", lastMessagePreview: "We would need 12 seats on Oct 3, morning slot.", opportunityState: "gathering", ownerUserId: null, ownerLabel: null, unreadCount: 1, recordChips: [], lastCustomerMessageAt: "2026-09-17T11:19:00Z" }),
  row({ id: "inq-4", contactName: "Diego Torres", channel: "whatsapp", subject: "Order #1203 · pickup 7:40pm", lastMessagePreview: "You: Paid, thanks. Your pizzas are in the oven.", conversationState: "awaiting_customer", opportunityState: "won", ownerLabel: "Marco P.", ownerUserId: "u-marco", unread: false, unreadCount: 0, recordChips: [CHIP_ORDER], lastCustomerMessageAt: "2026-09-17T11:00:00Z" }),
  row({ id: "inq-5", contactName: "Carla Méndez", channel: "counter", subject: "Balayage · Sat 11:00 with Dani", lastMessagePreview: "You: Deposit received, see you Saturday.", conversationState: "awaiting_customer", opportunityState: "won", unread: false, unreadCount: 0, recordChips: [CHIP_APPT], lastCustomerMessageAt: "2026-09-17T09:00:00Z" }),
  row({ id: "inq-7", contactName: "Lucía Fernández", channel: "sms", subject: "4 tickets · Friday show", lastMessagePreview: "Tickets sent to +52 55 8812 …", conversationState: "resolved", opportunityState: "won", ownerLabel: "Marco P.", ownerUserId: "u-marco", unread: false, unreadCount: 0, recordChips: [CHIP_TICKETS], lastCustomerMessageAt: "2026-09-15T09:00:00Z" }),
  row({ id: "inq-8", contactName: "Rafael O.", subject: "Corporate video shoot quote", lastMessagePreview: "Went with another agency, thanks anyway.", conversationState: "resolved", opportunityState: "lost", unread: false, unreadCount: 0, recordChips: [], lastCustomerMessageAt: "2026-09-14T09:00:00Z" }),
];

const ESSENTIALS = { name: "Valentina Ruiz", customer: { name: "Valentina Ruiz", email: "vale@ruiz.mx", phone: "+52 998 123 4411", identityLevel: "confirmed" as const, identityMethod: "sms_code", request: null, source: "Website" } };
const VISITOR = { name: "", customer: { name: "", email: null, phone: null, identityLevel: "none" as const, identityMethod: null, request: null, source: "Website" } };

function msg(id: string, body: string, over: Partial<ThreadMessage> = {}): ThreadMessage {
  return { id, inquiryId: "inq-1", kind: "text", body, payload: null, senderUserId: null, guestSessionId: "g", createdAt: "2026-09-17T10:41:00Z", editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null, ...over };
}

const TASKS: DerivedTask[] = [
  { key: "reply", title: "Reply, then revise the offer", why: "she asked for a second DJ set", primary: true },
  { key: "await_offer", title: "Follow up on the offer", why: "The offer was sent and is awaiting the client's acceptance.", primary: false },
  { key: "confirm_talent", title: "Confirm with talent", why: "1 talent confirmation pending.", primary: false },
];

const OFFER_LINES = [
  { label: "Sofía Herrera · hostess, 2 days", amount: "$1,400" },
  { label: "Anto · hostess, 2 days", amount: "$1,400" },
  { label: "Gala Duo package · DJ + sound, 5h", amount: "$1,000" },
  { label: "Travel Cancún to Tulum, included", amount: "$0", muted: true },
];
const ORDER_LINES = [
  { label: "Pepperoni L · extra cheese", amount: "$19.50", proposedBy: "client" as const },
  { label: "Quattro Formaggi L", amount: "$21.00", proposedBy: "client" as const },
  { label: "Garlic bread", amount: "$8.00", proposedBy: "staff" as const },
];
const SLOTS = [
  { id: "a", label: "Sat 09:30" },
  { id: "b", label: "Sat 11:00", picked: true },
  { id: "c", label: "Sat 14:00" },
  { id: "d", label: "Sun 10:00", unavailable: true },
];
const CHANGE_ROWS = [
  { label: "From", value: "Sat Sep 19 · 11:00 · Dani", muted: true },
  { label: "To", value: "Sun Sep 20 · 10:00 · Dani" },
  { label: "Policy", value: "Free change, more than 24h away" },
  { label: "Deposit", value: "kept · $40" },
];
const MATCH = { customerId: "c-77", level: "phone" as const, displayName: "Marco Salinas", email: null, phoneE164: "+529987710033", score: 0.9 };

type V = "desktop" | "mobile";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="kit-sec" data-kit-section={title}>
      <h2 className="kit-h2">{title}</h2>
      {children}
    </section>
  );
}
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="kit-h3">{title}</h3>
      {children}
    </div>
  );
}

function Primitives({ copy }: { copy: KitCopy }) {
  const tones: PillTone[] = ["needs", "wait", "done", "lost", "opp", "won", "rec", "money", "due", "ch", "off", "fail", "new"];
  return (
    <Section title="Primitives">
      <Sub title="Buttons: default · primary · secondary · danger · ghost · disabled · busy · xl">
        <div className="kit-row">
          <Btn>Revise</Btn>
          <Btn variant="primary">Request payment</Btn>
          <Btn variant="secondary">Resolve</Btn>
          <Btn variant="danger">Cancel booking</Btn>
          <Btn variant="ghost">Wait</Btn>
          <Btn disabled>Send</Btn>
          <Btn variant="primary" busy>
            Sending
          </Btn>
          <Btn size="xl" variant="primary">
            Confirm order
          </Btn>
          <Btn size="xs">Open</Btn>
          <Btn size="round" variant="ghost" aria-label="More">
            ⋯
          </Btn>
        </div>
      </Sub>
      <Sub title="Pills (families needs / wait / done / lost / opp / won / rec / money / due / ch / off / fail / new)">
        <div className="kit-row">
          {tones.map((t) => (
            <Pill key={t} tone={t}>
              {t}
            </Pill>
          ))}
        </div>
      </Sub>
      <Sub title="Chips and avatars">
        <div className="kit-row">
          <Chip soft>Mine</Chip>
          <Chip on>Unread</Chip>
          <Chip soft off>
            Coming
          </Chip>
          <Avatar name="Valentina Ruiz" />
          <Avatar name="Sofía H." size="sm" me />
          <Avatar name={null} size="lg" />
        </div>
      </Sub>
      <Sub title="Ladder">
        <PaymentLadder steps={paymentLadderSteps("opened", { requested: copy.ladder.requested, opened: copy.ladder.opened, paid: copy.ladder.paid, failed: copy.ladder.failed })} />
        <PaymentLadder steps={paymentLadderSteps("failed", { requested: copy.ladder.requested, opened: copy.ladder.opened, paid: copy.ladder.paid, failed: copy.ladder.failed })} />
      </Sub>
    </Section>
  );
}

function StateTagsAll({ copy }: { copy: KitCopy }) {
  return (
    <Section title="StateTags (three families, never merged)">
      <div className="kit-row">
        <StateTags state={S_NEEDS} chips={[CHIP_OFFER]} copy={copy} />
      </div>
      <div className="kit-row">
        <StateTags state={S_WAIT} chips={[CHIP_ORDER, CHIP_APPT]} copy={copy} />
      </div>
      <div className="kit-row">
        <StateTags state={S_RESOLVED} chips={[]} copy={copy} />
      </div>
      <div className="kit-row">
        <StateTags state={S_BARE} chips={[]} copy={copy} identityLevel="none" />
      </div>
    </Section>
  );
}

function InboxAll({ copy, v }: { copy: KitCopy; v: V }) {
  return (
    <Section title="Inbox: segments, chips, rows (ready · selected · unread · visitor · read · resolved), loading, empty ×3">
      <div className="kit-grid">
        <div className={v === "mobile" ? "" : "pane"}>
          <div className={v === "mobile" ? "mx-ih" : "ib-head"}>
            <InboxSegments value="needs" counts={{ needs: 3 }} copy={copy} variant={v} onChange={noop} />
            <FilterChips active={["mine"]} copy={copy} variant={v} onToggle={noop} />
          </div>
          <div className={v === "mobile" ? "mx-list" : "ib-list"}>
            <div className={v === "mobile" ? "mx-gh" : "grp-h"}>{copy.inbox.segments.needs} · 3</div>
            {ROWS.slice(0, 3).map((r, i) => (
              <InboxRowV5 key={r.id} row={r} copy={copy} variant={v} now={NOW} selected={i === 0} currentUserId="u-sofia" onOpen={noop} />
            ))}
            <div className={v === "mobile" ? "mx-gh" : "grp-h"}>{copy.state.conversation.awaiting_customer}</div>
            {ROWS.slice(3, 5).map((r) => (
              <InboxRowV5 key={r.id} row={r} copy={copy} variant={v} now={NOW} currentUserId="u-sofia" onOpen={noop} />
            ))}
            <div className={v === "mobile" ? "mx-gh" : "grp-h"}>{copy.state.conversation.resolved}</div>
            {ROWS.slice(5).map((r) => (
              <InboxRowV5 key={r.id} row={r} copy={copy} variant={v} now={NOW} currentUserId="u-sofia" onOpen={noop} />
            ))}
          </div>
        </div>
        <div className={v === "mobile" ? "" : "pane"}>
          <span className="kit-cap">loading</span>
          <Skeleton rows={4} variant={v} copy={copy} />
        </div>
        <div className={v === "mobile" ? "" : "pane"}>
          <EmptyState variant={v} icon="check" title={copy.inbox.empty.needsTitle} body={copy.inbox.empty.needsBody} action={{ label: copy.inbox.empty.needsAction, onClick: noop }} />
          <EmptyState variant={v} icon="search" title={copy.inbox.empty.searchTitle.replace("{query}", "lumina gala")} body={copy.inbox.empty.searchBody} action={{ label: copy.inbox.empty.searchAction, onClick: noop }} />
          <EmptyState variant={v} icon="refresh" title={copy.inbox.empty.failedTitle} body={copy.inbox.empty.failedBody} action={{ label: copy.inbox.empty.failedAction, onClick: noop, primary: true }} />
        </div>
      </div>
    </Section>
  );
}

function HeaderAll({ copy, v }: { copy: KitCopy; v: V }) {
  const base = { chips: [CHIP_OFFER], channel: "web_chat" as const, subject: "Beach wedding · Tulum · Aug 14", when: "80 guests", copy, variant: v, onBack: noop, onAssign: noop, onResolve: noop, onReopen: noop, onMore: noop };
  return (
    <Section title="ThreadHeader: ready · busy (resolving) · resolved · visitor / unassigned">
      <div className="kit-stream">
        <ThreadHeader {...base} essentials={ESSENTIALS} state={S_NEEDS} owner={{ label: "Sofía H.", isMe: true }} />
        <ThreadHeader {...base} essentials={ESSENTIALS} state={S_NEEDS} owner={{ label: "Sofía H.", isMe: true }} busy />
        <ThreadHeader {...base} essentials={ESSENTIALS} state={S_RESOLVED} chips={[]} owner={{ label: "Marco P.", isMe: false }} />
        <ThreadHeader {...base} essentials={VISITOR} state={S_BARE} chips={[]} owner={null} subject="Table for 6 on Friday?" when={null} />
        {v === "mobile" ? (
          <>
            <EssentialsStrip state={S_NEEDS} chips={[CHIP_OFFER]} amountLabel="$3,800 · $0 paid" copy={copy} onDetails={noop} />
            <EssentialsStrip state={S_BARE} chips={[]} amountLabel={null} copy={copy} onDetails={noop} />
          </>
        ) : null}
      </div>
    </Section>
  );
}

function StreamAll({ copy, v }: { copy: KitCopy; v: V }) {
  return (
    <Section title="Stream: day separator, bubbles (client first/last, staff delivered, note, sending, failed, quote, voice, removed), system line, unread divider">
      <div className={v === "mobile" ? "mx-st" : "stream"}>
        <DaySeparator label="Jul 26" variant={v} />
        <MessageBubble variant={v} copy={copy} mine={false} position="first" message={msg("m1", "Hi! We are planning a beach wedding in Tulum on Aug 14, about 80 guests.")} />
        <MessageBubble variant={v} copy={copy} mine={false} position="last" meta="Valentina · 4:12 PM · web chat" message={msg("m2", "We would love two hostesses and a DJ.")} />
        <SystemLine variant={v} text="Sofía took this conversation" />
        <MessageBubble variant={v} copy={copy} mine meta="You · 4:20 PM" delivery="delivered" message={msg("m3", "Congratulations! Sofía and Anto are both free on Aug 14. Sending you a proposal now.")} />
        <MessageBubble variant={v} copy={copy} mine meta="Sofía · Jul 26" message={msg("m4", "Bride prefers Spanish. Venue contact is Luis at the hotel.", { kind: "internal_note", internal: true })} />
        <DaySeparator label={copy.stream.today} variant={v} />
        <UnreadDivider count={2} copy={copy} variant={v} />
        <MessageBubble variant={v} copy={copy} mine={false} meta="Valentina · 10:41 AM" quote={{ author: "You", text: "Sending you a proposal now." }} message={msg("m5", "This looks great. Can we add a second DJ set after dinner?")} />
        <MessageBubble variant={v} copy={copy} mine={false} meta="Ana P. · 3:30 PM · email" voice={{ durationLabel: "0:42", transcript: "…the same hostesses as last year's gala…" }} message={msg("m6", "")} />
        <MessageBubble variant={v} copy={copy} mine delivery="sending" message={msg("m7", "Yes, a second set is $450 for 2 more hours.")} />
        <MessageBubble variant={v} copy={copy} mine delivery="failed" onRetry={noop} message={msg("m8", "Deposit is refundable up to 14 days before.")} />
        <MessageBubble variant={v} copy={copy} mine={false} message={msg("m9", "x", { deletedAt: "2026-09-17T10:50:00Z" })} />
      </div>
    </Section>
  );
}

function CardsAll({ copy, v }: { copy: KitCopy; v: V }) {
  const offerStates: OfferCardState[] = ["draft", "sent", "viewed", "accepted", "declined", "expired"];
  const payStates: PaymentCardState[] = ["requested", "opened", "paid", "failed", "expired", "refunded", "partially_refunded", "unknown"];
  const idStates: IdentityCaptureState[] = ["idle", "matching", "saving", "refused", "done"];
  return (
    <Section title="Cards (category grammar): Offer ×6 · Payment ×8 · Order ×4 · Appointment ×5 · Times ×4 · Change ×4 · Identity ×5">
      <div className={v === "mobile" ? "mx-st" : "stream"}>
        {offerStates.map((s) => (
          <OfferCard key={s} variant={v} copy={copy} state={s} title="Beach wedding Aug 14" version={2} versions={[1, 2]} forName="Valentina Ruiz" affects="Sofía Herrera, Anto" lines={OFFER_LINES} total="$3,800" depositLine={{ pct: "30%", amount: "$1,140" }} validUntil="Aug 1" viewedAt="10:14" onAction={noop} />
        ))}
        <OfferCard variant={v} copy={copy} state="draft" title="Beach wedding Aug 14 (busy)" version={3} forName="Valentina Ruiz" lines={OFFER_LINES} total="$3,800" onAction={noop} busy />
        {payStates.map((s) => (
          <PaymentCard key={s} variant={v} copy={copy} state={s} label="Deposit · Beach wedding" amount="$1,140" payerName="Valentina Ruiz" expiredOn="Aug 2" refundAmount={s === "partially_refunded" ? "$400" : null} onAction={noop} />
        ))}
        <PaymentCard variant={v} copy={copy} state="requested" label="Deposit · Beach wedding (busy)" amount="$1,140" payerName="Valentina Ruiz" onAction={noop} busy />
        <OrderCard variant={v} copy={copy} mode="draft" title="Basket" clientName="Diego" version={4} lines={ORDER_LINES} total="$48.50" pickupLabel="7:40 PM" step="draft" foot="v3 by Diego 6:58 · v4 by you 7:01 · availability rechecked" onAction={noop} />
        <OrderCard variant={v} copy={copy} mode="draft" title="Basket" clientName="Diego" version={4} lines={ORDER_LINES} total="$48.50" step="draft" onAction={noop} busy />
        <OrderCard variant={v} copy={copy} mode="order" title="#1203" clientName="Diego Torres · pickup at the counter" lines={[{ label: "Kitchen ticket #88 · started 7:12 PM", amount: "ready ~7:35" }]} total="$48.50" step="paid" paymentState="paid" fulfilmentState="preparing" foot="Receipt sent to WhatsApp" onAction={noop} />
        <OrderCard variant={v} copy={copy} mode="order" title="#1203" clientName="Diego Torres" lines={[]} total="$48.50" step="fulfilled" paymentState="paid" fulfilmentState="fulfilled" onAction={noop} />
        <AppointmentCard variant={v} copy={copy} title="AP-2041" clientName="Carla Méndez" withName="Dani" state="hold" lines={[{ label: "Balayage · 2h 30m", value: "Sat Sep 19 · 11:00" }]} onAction={noop} />
        <AppointmentCard variant={v} copy={copy} title="Project PJ-27" isProject state="confirming" ladder={[{ label: "Sofía Aug 14 to 15", done: true }, { label: "Dani Aug 14 to 15", done: true }, { label: "Sound system", done: false }, { label: "Create project", done: false }]} onAction={noop} />
        <AppointmentCard variant={v} copy={copy} title="AP-2041" clientName="Carla Méndez" withName="Dani" state="confirmed" paymentState="deposit_paid" lines={[{ label: "Balayage · 2h 30m · Dani", value: "Sat Sep 19 · 11:00" }, { label: "Chair 3 · Basin 1 reserved", muted: true }, { label: "Deposit paid · card", value: "$40" }]} balanceLabel="$140" onAction={noop} />
        <AppointmentCard variant={v} copy={copy} title="AP-2041" clientName="Carla Méndez" withName="Dani" state="cancelled" lines={[{ label: "Policy: free until 24h before · cancelled 3 days before", value: "no fee" }, { label: "Deposit $40", value: "refunded" }]} freeAgain="Chair 3 and Dani" />
        <AppointmentCard variant={v} copy={copy} title="Project PJ-27" isProject state="conflict" conflicts={[{ line: "Anto · hostess", why: "Anto is no longer free on Aug 14", at: "2026-08-14T19:00:00Z", code: "person_busy" }]} onAction={noop} />
        <TimesCard variant={v} copy={copy} withName="Dani" clientName="Carla" slots={SLOTS.map((s) => ({ ...s, picked: false }))} state="sent" detail="Balayage · 2h 30m · Chair 3" onAction={noop} />
        <TimesCard variant={v} copy={copy} withName="Dani" clientName="Carla" slots={SLOTS} state="picked" holdLeft="12:41" detail="Balayage · 2h 30m · Chair 3" onAction={noop} />
        <TimesCard variant={v} copy={copy} withName="Dani" clientName="Carla" slots={SLOTS} state="hold_ended" onAction={noop} />
        <TimesCard variant={v} copy={copy} withName="Dani" clientName="Carla" slots={[]} state="sent" onAction={noop} />
        <ChangeRequestCard variant={v} copy={copy} title="Move to Sunday" mode="preview" clientName="Carla" rows={CHANGE_ROWS} onAction={noop} />
        <ChangeRequestCard variant={v} copy={copy} title="Move to Sunday" mode="preview" clientName="Carla" rows={CHANGE_ROWS} onAction={noop} busy />
        <ChangeRequestCard variant={v} copy={copy} title="on v2" mode="requested" clientName="Valentina" rows={[{ label: "Remove one hostess · keep DJ package", value: "your call" }]} onAction={noop} />
        <ChangeRequestCard variant={v} copy={copy} title="Move to Sunday" mode="applied" clientName="Carla" rows={CHANGE_ROWS.slice(1, 2)} />
        <ChangeRequestCard variant={v} copy={copy} title="Move to Sunday" mode="declined" clientName="Carla" rows={CHANGE_ROWS.slice(1, 2)} />
        {idStates.map((s) => (
          <IdentityCaptureCard key={s} variant={v} copy={copy} name="Marco Salinas" phone="+52 998 771 0033" email="" matches={[MATCH]} selected="c-77" state={s} refusal={s === "refused" ? "identity_unconfirmed" : null} linkedName="Marco Salinas" onChange={noop} onSelect={noop} onSave={noop} />
        ))}
      </div>
    </Section>
  );
}

function NextAndComposer({ copy, v }: { copy: KitCopy; v: V }) {
  const states: ComposerState[] = ["idle", "typing", "sending", "failed", "offline", "resolved", "refused"];
  const action = { label: "Revise offer", onClick: noop };
  return (
    <Section title="Next step (ready · loading · busy · empty · done) and Composer (idle · typing · sending · failed · offline · resolved · refused · note)">
      <div className="kit-stream">
        {v === "mobile" ? (
          <>
            <NextStepBlock tasks={TASKS} copy={copy} action={action} onMoreTasks={noop} />
            <NextStepBlock tasks={[]} copy={copy} action={null} loading />
            <NextStepBlock tasks={TASKS} copy={copy} action={action} busy />
            <NextStepBlock tasks={[]} copy={copy} action={null} />
            <NextStepBlock tasks={[{ key: "closed", title: "Resolved", why: "This conversation is resolved.", primary: true }]} copy={copy} action={null} />
          </>
        ) : (
          <>
            <NextStepBar tasks={TASKS} copy={copy} action={action} secondaryAction={{ label: "Remind Jul 31", onClick: noop }} onMoreTasks={noop} />
            <NextStepBar tasks={[]} copy={copy} action={null} loading />
            <NextStepBar tasks={TASKS} copy={copy} action={action} busy />
            <NextStepBar tasks={[]} copy={copy} action={null} />
            <NextStepBar tasks={[{ key: "closed", title: "Resolved", why: "This conversation is resolved.", primary: true }]} copy={copy} action={null} />
          </>
        )}
        {states.map((s) => (
          <Composer key={s} variant={v} copy={copy} mode="reply" state={s} value={s === "typing" || s === "sending" || s === "failed" ? "See you Saturday! Come 5 minutes early." : ""} channel="web_chat" fallbackChannel="email" refusal={s === "refused" ? "identity_unconfirmed" : null} refusalAction={s === "refused" ? { label: "Capture identity", onClick: noop } : null} suggestions={s === "idle" ? ["Yes, a second set is $450 for 2 more hours", "Deposit is refundable up to 14 days before"] : undefined} onSend={noop} onRetry={noop} onReopen={noop} onModeChange={noop} onChange={noop} />
        ))}
        <Composer variant={v} copy={copy} mode="note" state="idle" value="" channel="web_chat" okText="Note saved" onSend={noop} onModeChange={noop} onChange={noop} />
        <RefusalLine code="hold_ended" copy={copy} variant={v} action={{ label: copy.times.offerNew, onClick: noop }} />
        <OkLine text="Deposit received · $1,140" variant={v} />
        <AlertLine text="Hold expires in 3 min" variant={v} action={{ label: "Extend", onClick: noop }} />
      </div>
    </Section>
  );
}

function PanelAll({ copy, v }: { copy: KitCopy; v: V }) {
  return (
    <Section title="Context panel: summary (ready · loading), sections open / closed, option rows, line editor">
      <div className="kit-grid">
        <div className={v === "mobile" ? "" : "kit-panel"}>
          <SummaryBlock name="Valentina Ruiz" identityLabel={copy.identity.confirmed} phone="+52 998 123 4411" next="Reply, then remind Jul 31" main="Offer v2 · awaiting acceptance" amount="$3,800 · $0 paid" copy={copy} />
          <SummaryBlock name={copy.inbox.visitor} isVisitor identityLabel={copy.identity.none} next="" main="" amount="" copy={copy} loading />
          <PanelSection title="Client" open copy={copy} variant={v} action={{ label: copy.panel.open, onClick: noop }} onToggle={noop}>
            <dl className="kv">
              <dt>Client</dt>
              <dd>Valentina Ruiz</dd>
              <dt>Phone</dt>
              <dd>+52 998 123 4411</dd>
              <dt>Source</dt>
              <dd>Website · talent Sofía Herrera</dd>
            </dl>
          </PanelSection>
          <PanelSection title="Money" open copy={copy} variant={v} onToggle={noop}>
            <div className="money-line">
              <span>Offer v2 · sent Jul 28</span>
              <span>$3,800</span>
            </div>
            <div className="money-line">
              <span>Paid</span>
              <span>$0</span>
            </div>
            <div className="money-line t">
              <span>Balance</span>
              <span>$3,800</span>
            </div>
          </PanelSection>
          <PanelSection title="Files" open={false} count={3} copy={copy} variant={v} onToggle={noop} />
          <PanelSection title="Team notes" open={false} count={1} copy={copy} variant={v} onToggle={noop} />
          <PanelSection title="Follow-up" open={false} count="Jul 31" copy={copy} variant={v} onToggle={noop} />
        </div>
        <div className="kit-stream">
          <OptionRow variant={v} selected title="Deposit 30%" sub="$1,140 · balance on the day" amount="$1,140" onSelect={noop} />
          <OptionRow variant={v} selected={false} title="Full amount" sub="$3,800" amount="$3,800" onSelect={noop} />
          <OptionRow variant={v} selected={false} title="Anto" sub="Booked Sep 20 · Tulum" disabled onSelect={noop} />
          <OptionRow variant={v} selected control="check" title="Sofía Herrera" sub="Hostess · evening rate" amount="$700" onSelect={noop} />
          <OptionRow variant={v} selected={false} control="check" title="Custom line" sub="Anything not in the catalog" onSelect={noop} />
        </div>
        <div className="kit-stream">
          <LineEditorRow variant={v} copy={copy} avatarName="Sofía Herrera" name="Sofía Herrera · hostess" sub="2 days" units="2" price="$1,400" proposedBy="staff" confirmed onUnits={noop} onPrice={noop} onMore={noop} />
          <LineEditorRow variant={v} copy={copy} avatarName="Anto" name="Anto · hostess" sub="2 days · awaiting her yes" units="2" price="$1,400" proposedBy="client" proposedByName="Valentina" onUnits={noop} onPrice={noop} onMore={noop} />
          <LineEditorRow variant={v} copy={copy} icon="pkg" name="Gala Duo package" sub="DJ + sound · 5h" units="1" price="$1,000" priceSnapshot="$900" edited onUnits={noop} onPrice={noop} onMore={noop} />
          <LineEditorRow variant={v} copy={copy} avatarName="Dani Ortega" name="Dani Ortega · hostess" units="" price="" removed={{ by: "you" }} onRestore={noop} />
          <LineEditorRow variant={v} copy={copy} avatarName="Lucía M." name="Lucía M. · hostess" units="" price="" unavailable={{ date: "Aug 14" }} />
          <LineEditorRow variant={v} copy={copy} avatarName="Sofía Herrera" name="Sofía Herrera · hostess (busy)" units="2" price="$1,400" busy onUnits={noop} onPrice={noop} onMore={noop} />
        </div>
      </div>
    </Section>
  );
}

function OverlaysDesktop({ copy, width }: { copy: KitCopy; width: 1194 | 1440 }) {
  return (
    <Section title="Overlays: right sheet (520 / 560 / 600), the + tray, filter chips">
      <div className="kit-widths">
        <div className={`kit-w rel ${width === 1440 ? "w1440" : "w1194"}`}>
          <Tray groups={defaultTrayGroups(copy)} onPick={noop} />
          <Sheet open title="Request payment" copy={copy} onClose={noop} avatarName="Valentina Ruiz" hint="Nothing is charged until she pays" footer={<Btn variant="primary">Send link</Btn>}>
            <OptionRow selected title="Deposit 30%" sub="$1,140 · balance on the day" amount="$1,140" onSelect={noop} />
            <OptionRow selected={false} title="Full amount" sub="$3,800" amount="$3,800" onSelect={noop} />
            <OptionRow selected={false} title="Balance" sub="$2,660 · after the deposit" amount="$2,660" onSelect={noop} />
          </Sheet>
        </div>
        <div className={`kit-w rel ${width === 1440 ? "w1440" : "w1194"}`}>
          <Sheet open width={600} title="Items · Valentina wedding booking" copy={copy} onClose={noop} avatarName="Valentina Ruiz" footer={<Btn variant="primary">Create offer</Btn>}>
            <LineEditorRow copy={copy} avatarName="Sofía Herrera" name="Sofía Herrera · hostess" sub="2 days" units="2" price="$1,400" confirmed onUnits={noop} onPrice={noop} onMore={noop} />
            <LineEditorRow copy={copy} avatarName="Anto" name="Anto · hostess" sub="2 days" units="2" price="$1,400" proposedBy="client" proposedByName="Valentina" onUnits={noop} onPrice={noop} onMore={noop} />
            <LineEditorRow copy={copy} icon="pkg" name="Gala Duo package" sub="DJ + sound · 5h" units="1" price="$1,000" onUnits={noop} onPrice={noop} onMore={noop} />
          </Sheet>
        </div>
      </div>
    </Section>
  );
}

function OverlaysMobile({ copy }: { copy: KitCopy }) {
  return (
    <Section title="Overlays: bottom sheet h60 (Filter), h92 (Add items), full screen (Offer v3), actions tray">
      <div className="kit-widths">
        <div className="kit-mx">
          <FilterSheet open active={["mine", "unread", "paymentIssues"]} copy={copy} resultCount={3} onToggle={noop} onClear={noop} onApply={noop} onClose={noop} />
        </div>
        <div className="kit-mx">
          <Sheet open variant="mobile-h92" title={copy.tray.addItems} copy={copy} onClose={noop} tight footer={<Btn size="xl" variant="primary" fill>Continue · 3 items · $2,400</Btn>}>
            <div className="mx-chips">
              <Chip on>All</Chip>
              <Chip>Talent</Chip>
              <Chip>Packages</Chip>
              <Chip>Services</Chip>
            </div>
            <div className="mx-gh">Available Sep 20, 7pm to midnight</div>
            <OptionRow variant="mobile" selected control="check" leading={<Avatar name="Sofía Herrera" size="lg" />} title="Sofía Herrera" sub="Hostess · evening rate" amount="$700" onSelect={noop} />
            <OptionRow variant="mobile" selected={false} control="check" leading={<Avatar name="Anto" size="lg" />} title="Anto" sub="Booked Sep 20 · Tulum" disabled onSelect={noop} />
            <OptionRow variant="mobile" selected control="check" leading={<Avatar name={null} size="lg" icon="pkg" />} title="Gala Duo package" sub="DJ + sound · 5h" amount="$1,000" onSelect={noop} />
          </Sheet>
        </div>
        <div className="kit-mx">
          <Sheet open variant="mobile-full" title="Offer v3" subtitle="Beach wedding · Aug 14 · Valentina Ruiz" copy={copy} onClose={noop} footer={<Btn size="xl" variant="primary" fill>Send offer</Btn>}>
            <div className="mx-gh">What Valentina sees</div>
            <LineEditorRow variant="mobile" copy={copy} avatarName="Sofía Herrera" name="Sofía Herrera" sub="hostess, 2 days" units="2" price="$1,400" onUnits={noop} onPrice={noop} onMore={noop} />
            <LineEditorRow variant="mobile" copy={copy} icon="pkg" name="Gala Duo package" sub="DJ + sound · 5h" units="1" price="$1,000" onUnits={noop} onPrice={noop} onMore={noop} />
          </Sheet>
        </div>
        <div className="kit-mx">
          <Sheet open variant="mobile-h60" title="Actions" copy={copy} onClose={noop} tight>
            <Tray groups={defaultTrayGroups(copy)} variant="mobile" onPick={noop} />
          </Sheet>
        </div>
      </div>
    </Section>
  );
}

function Width({ width, copy }: { width: 390 | 1194 | 1440; copy: KitCopy }) {
  const v: V = width === 390 ? "mobile" : "desktop";
  return (
    <div className={`kit-w w${width}`} data-kit-width={width}>
      <h1 className="kit-h1">
        {width}px · {v}
      </h1>
      <Primitives copy={copy} />
      <StateTagsAll copy={copy} />
      <InboxAll copy={copy} v={v} />
      <HeaderAll copy={copy} v={v} />
      <StreamAll copy={copy} v={v} />
      <CardsAll copy={copy} v={v} />
      <NextAndComposer copy={copy} v={v} />
      <PanelAll copy={copy} v={v} />
      {width === 390 ? <OverlaysMobile copy={copy} /> : <OverlaysDesktop copy={copy} width={width} />}
    </div>
  );
}

export function KitPreviewBody({ copy }: { copy: KitCopy }) {
  return (
    <div className="msgv5 kit-preview" data-kit-preview>
      <Width width={390} copy={copy} />
      <Width width={1194} copy={copy} />
      <Width width={1440} copy={copy} />
    </div>
  );
}

export function KitPreview() {
  const copy = useKitCopy();
  return <KitPreviewBody copy={copy} />;
}
