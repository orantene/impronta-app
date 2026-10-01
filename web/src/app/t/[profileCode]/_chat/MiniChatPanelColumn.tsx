"use client";

/** MiniChatPanelColumn — vertical thread column for MiniChatPanel (Lane C / F4). */

import { useState, type RefObject } from "react";

import type {
  AddClaimEmailCallback,
  CaptureGuestChipCallback,
  CheckGuestClaimEmailCallback,
  GuestChipInput,
  GuestChipKind,
  GuestChipValue,
  GuestIdentityTier,
  GuestInquirySummary,
  GuestThreadStatus,
  GuestThreadV5Extras,
  InquiryReceiptData,
  ListGuestInquiriesCallback,
  ListGuestTenantRosterCallback,
  MiniChatBrand,
  ScanGuestConversationCallback,
} from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

import type { StreamRow } from "./MiniChatMessageBubble";
import { guestThreadBlocksSendBar } from "./guest-thread-blocks-send";
import { ConversationStatusStrip } from "./ConversationStatusStrip";
import { GuestConversationBody } from "./GuestConversationBody";
import { countCoreDetails } from "./guest-detail-progress";
import { GuestDockChrome } from "./GuestDockChrome";
import { GuestDockHomeView } from "./GuestDockHomeView";
import { GuestDockLineupView } from "./GuestDockLineupView";
import { GuestDockProjectsView } from "./GuestDockProjectsView";
import { CardDockServicesView } from "./CardDockServicesView";
import { CardDockAskFooter, CardDockBackToBooking, CardDockIntro } from "./CardDockChatExtras";
import type { GuestDockView } from "./guest-dock-view";
import { GuestComposerNotices } from "./GuestComposerNotices";
import { GuestLegacyDetailChips } from "./GuestLegacyDetailChips";
import { GuestDetailsControl } from "./GuestDetailsControl";
import { GuestHablarOfferPreview } from "./GuestHablarOfferPreview";
import { guestHeaderThreadState, hasSentGuestMessage, isPrivateDraftThread } from "./guest-thread-state";
import type { GuestHeaderThreadState } from "./GuestPanelHeader";
import { GuestThreadSwitcherDrawer } from "./GuestThreadSwitcherDrawer";
import { MiniChatComposer } from "./MiniChatComposer";
import { GuestNextStep } from "./GuestNextStep";
import { useGuestDockModel } from "./use-guest-dock-model";
import { useGuestDockJourney } from "./use-guest-dock-journey";
import { MiniChatGateForm } from "./MiniChatGateForm";
import { GuestHandoffContactStrip } from "./GuestHandoffContactStrip";
import { type ChatOffering } from "./OfferingQuickPicker";
import { GuestComposerOfferingStrip } from "./GuestComposerOfferingStrip";
import { guestComposerPlaceholder } from "./guest-composer-placeholder";
import { SendToAgencyBar } from "./SendToAgencyBar";
import { buildGateLineupRecap } from "./guest-gate-lineup-recap";
import {
  EMAIL_RE,
  paletteFor,
  type SurfaceMode,
} from "./mini-chat-styles";

export type MiniChatPanelColumnProps = {
  // Brand + colors
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  talentFirst: string;
  // Context
  tenantSlug: string;
  talentProfileId: string;
  open: boolean;
  expanded: boolean;
  // Thread state (read-only; mutations via callbacks)
  inquiryId: string | null;
  rows: StreamRow[];
  scrollRef: RefObject<HTMLDivElement | null>;
  stage: "intro" | "gate" | "thread";
  threadStatus: GuestThreadStatus;
  typicalReply: string | null;
  /** Post-send receipt; null pre-send. */
  receipt?: InquiryReceiptData | null;
  /** L13: v5 extras + full-load bump + early-row ensure for catalog adds. */
  v5?: GuestThreadV5Extras | null;
  onRefreshThread?: () => void;
  onEnsureInquiryForItems?: (() => Promise<string | null>) | null;
  emailedTo: string | null;
  seenAtByInquiry: Record<string, string>;
  pulseActive: boolean;
  limitNudge: {
    tier: GuestIdentityTier;
    activeCount: number;
    limit: number;
  } | null;
  capturedChipKinds: GuestChipKind[];
  // Composer state
  draft: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  honeypot: string;
  sending: boolean;
  error: string | null;
  inCooldown: boolean;
  cooldownSecs: number;
  sendDisabled: boolean;
  captchaRequired: boolean;
  // Callbacks (UI → parent)
  onClose: () => void;
  onDraftChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onHoneypotChange: (v: string) => void;
  onSubmit: () => void;
  onFirstSend: () => void;
  gateEmailNotice?: string | null;
  gateEmailBlocksSubmit?: boolean;
  onAddClaimEmail: AddClaimEmailCallback | null;
  onCheckClaimEmail?: CheckGuestClaimEmailCallback | null;
  onGuestEmailUpdated?: (email: string) => void;
  onSwitchInquiry: (id: string) => void;
  onCaptureChip: CaptureGuestChipCallback | null;
  onCapturedChipKind: (kind: GuestChipKind) => void;
  /**
   * P1-T1/T2: route a chip edit through useUnifiedInquiry.patch (lazily creates
   * the early row, writes via captureGuestChip, tracks sync state). When set this
   * supersedes the direct onCaptureChip path for chip edits.
   */
  onPatchChip?: ((kind: GuestChipKind, value: GuestChipValue) => Promise<void>) | null;
  /** Per-kind captured chip values (re-edit pre-fill + reconcile display). */
  capturedChipValues?: Partial<Record<GuestChipKind, GuestChipValue>>;
  /** Per-kind sync status for the field-level micro-status (B.4). */
  chipFieldState?: Record<string, UnifiedSyncState>;
  /** Kinds a remote edit just changed, for the accent flash (P1-T3). */
  chipRemoteFlashKinds?: GuestChipKind[];
  /**
   * Finding #3: the panel-level sync state, folded into the header draft lock
   * chip's sub-text so failed writes are visible while the inquiry is a private
   * draft (Wave 1 subsumed the old DraftPrivacyBanner band into the header).
   */
  syncState?: UnifiedSyncState;
  /** Re-run the last failed patch (the draft lock chip's retry action). */
  onRetrySync?: () => void;
  /**
   * Jon 360 Phase 1: the inquiry is a private draft (an early row exists but the
   * contact is not yet promoted, so nothing has reached the agency). Drives the
   * header draft lock chip (Wave 1; formerly the DraftPrivacyBanner band).
   */
  inquiryRecordExists?: boolean;
  /** Whether the inquiry's contact has been promoted (real send happened). */
  contactPromoted?: boolean;
  /** Play the SENT airlock overlay (a real send just succeeded). */
  showSentAirlock?: boolean;
  /**
   * Finding #2: the explicit "Send to agency" submit. Forces the ContactCard gate
   * when contact is still the placeholder seed, then confirms via `sentNote`.
   */
  onSendToAgency?: () => void;
  /** Whether to show the post-send success confirmation note. */
  sentNote?: boolean;
  // ── Phase 2: Talent / Brief / Contact "Add more details" expansion ──────────
  /** When true the "Add more details" button toggles the extras editors. */
  extrasEnabled?: boolean;
  /** Whether the extras editors are currently expanded. */
  extrasOpen?: boolean;
  /** Toggle the extras expansion. */
  onToggleExtras?: () => void;
  /** Injected guest-safe roster loader for the in-chat talent picker. */
  onListRoster?: ListGuestTenantRosterCallback | null;
  /** Current selected talent ids (from the unified draft). */
  selectedTalentIds?: string[];
  /**
   * Phase 6 — live cart talent display names, used only for the gate recap line
   * ("...send you {agency} reply about {Jane, +2}"). Aligned with the cart, so it
   * reflects the exact lineup the contact ask is anchoring.
   */
  cartTalentNames?: string[];
  /** Current brief summary (from the unified draft). */
  briefSummary?: string | null;
  /** Current contact values (from the unified draft). */
  contactValues?: { name: string | null; email: string | null; phone: string | null };
  /**
   * Addendum A: the full live unified draft. Drives the collapsible details
   * sidebar's filled-state. When present (extras enabled) the rail renders as the
   * primary details affordance.
   */
  inquiryIntent?: InquiryIntent | null;
  /** Commit a new talent selection through useUnifiedInquiry.patch. */
  onTalentChange?: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  /** Commit a brief edit through useUnifiedInquiry.patch. */
  onBriefChange?: (summary: string) => void;
  /** Commit a contact edit through useUnifiedInquiry.patch. */
  onContactChange?: (value: { name: string; email: string; phone: string }) => void;
  /**
   * Phase 3: the cart is empty, so lead with the talent-pick step (greeting +
   * auto-opened Talent section). Drives the empty-state copy + auto-expand.
   */
  talentPickFirst?: boolean;
  /**
   * Phase 3 one-shot: open the details rail to a specific section (the +N chip /
   * a rail avatar deep-links to "talent"; the empty cart leads with "talent").
   */
  railOpenToSection?: "talent" | null;
  /** Clear the railOpenToSection one-shot once applied. */
  onConsumeRailOpenTo?: () => void;
  // Optional
  prefill?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  openFullHref?: string | null;
  onListGuestInquiries?: ListGuestInquiriesCallback | null;
  onToggleExpand?: () => void;
  identity: GuestIdentityTier;
  /**
   * P0-5 / W0-F — hub host (platform/network hub or marketing apex). Drives the
   * SendToAgencyBar copy so the send button + notes drop the agency framing.
   */
  isHub?: boolean;
  /**
   * W1-G: the talent's services, rendered as the OfferingQuickPicker strip ABOVE
   * the composer inside the column (moved in from MiniChatPanel's outer div, where
   * it was clipped below the rounded footer). Empty array hides the strip.
   */
  offerings?: ChatOffering[];
  /** Pick a service: prefill the composer + attach it to the inquiry. */
  onPickOffering?: (o: ChatOffering) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  // ── W2-A: the 3-view dock (Chat / Lineup / Projects) ───────────────────────
  /** Active dock view. "chat" (default) renders today's panel unchanged. */
  dockView?: GuestDockView;
  /** Switch the dock view. Absent → the switcher band never renders. */
  onDockViewChange?: (view: GuestDockView) => void;
  /** The guest's inquiries (useGuestInquiriesList) — the Projects view data. */
  inquiries?: GuestInquirySummary[];
  /** Source attribution for a Lineup-view "move to inquiry" add. */
  sourcePage?: string;
  /**
   * The launcher's unified remove path (cart flip + record patch + Undo) — the
   * Lineup view's per-tile remove routes through THIS, same as the rail X.
   */
  onRemoveCartTalent?: (talentProfileId: string) => void;
  /** DOCK v2 — the AI conversation scan for the Add-details sheet. */
  onScanConversation?: ScanGuestConversationCallback | null;
  /** DOCK v2: remount-with-fresh-draft (active thread already sent). */
  onStartFresh?: (() => void) | null;
  /** DOCK v2 — signed-in client dashboard link for the Home Account card. */
  dashboardHref?: string | null;
  /** `chat.variant = card`: the card skin (header icons, token palette, intro). */
  card?: ChatCardConfig | null;
};

export function MiniChatPanelColumn({
  brand,
  accent: accentProp,
  accentInk: accentInkProp,
  surfaceMode: surfaceModeProp = "light",
  talentFirst,
  tenantSlug,
  talentProfileId,
  expanded,
  inquiryId,
  rows,
  scrollRef,
  stage,
  threadStatus,
  typicalReply,
  receipt = null,
  v5 = null,
  onRefreshThread,
  onEnsureInquiryForItems = null,
  emailedTo,
  seenAtByInquiry,
  pulseActive,
  limitNudge,
  capturedChipKinds,
  draft,
  firstName,
  lastName,
  email,
  phone = "",
  honeypot,
  sending,
  error,
  inCooldown,
  cooldownSecs,
  sendDisabled,
  captchaRequired,
  onClose,
  onDraftChange,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onHoneypotChange,
  onSubmit,
  onFirstSend,
  gateEmailNotice = null,
  gateEmailBlocksSubmit = false,
  onAddClaimEmail,
  onCheckClaimEmail,
  onGuestEmailUpdated,
  onSwitchInquiry,
  onCaptureChip,
  onCapturedChipKind,
  onPatchChip = null,
  capturedChipValues = {},
  chipFieldState = {},
  chipRemoteFlashKinds = [],
  syncState = "idle",
  onRetrySync,
  inquiryRecordExists = false,
  contactPromoted = false,
  showSentAirlock = false,
  onSendToAgency,
  sentNote = false,
  extrasEnabled = false,
  onListRoster = null,
  onTalentChange,
  onBriefChange,
  onContactChange,
  talentPickFirst = false,
  cartTalentNames = [],
  railOpenToSection = null,
  onConsumeRailOpenTo,
  inquiryIntent = null,
  prefill,
  onToggleExpand,
  identity,
  isHub = false,
  offerings = [],
  onPickOffering,
  textareaRef,
  dockView = "chat",
  onDockViewChange,
  inquiries = [],
  sourcePage = "",
  onRemoveCartTalent,
  onScanConversation = null,
  onStartFresh = null,
  dashboardHref = null,
  card = null,
}: MiniChatPanelColumnProps) {
  // Card skin: the site's own tokens drive every dock surface (paletteFor("card")).
  const accent = card?.colors.accent ?? accentProp;
  const accentInk = card?.colors.onAccent ?? accentInkProp;
  const surfaceMode: SurfaceMode = card ? "card" : surfaceModeProp;
  // Guest UI locale rides along on `brand` (resolved server-side from the
  // tenant's default_locale, since guests have no LOCALE_COOKIE).
  const t = createTranslator(brand.locale ?? "en");
  // Jon 360 Phase 7 — the active C palette. Light by default (byte-identical to
  // before); dark for noir tenants. Every `C.*` below resolves through this, so a
  // single binding flips the whole column's surface/ink/borders.
  const C = paletteFor(surfaceMode);
  const gateReady = Boolean(firstName.trim()) && EMAIL_RE.test(email.trim());
  const guestContactEmail =
    (emailedTo ?? prefill?.email ?? email.trim()) || null;
  const showGate = stage === "gate";
  // Jon 360 Phase 1: the inquiry is a private draft while its early row exists but
  // the contact is not yet promoted (nothing has reached the agency). Hidden at the
  // gate (the gate is its own moment) and once the airlock plays.
  // Moved into `guest-thread-state.ts` so it can be tested. Inline here, the
  // only way to exercise it was to render this whole component — so it never
  // was, and a submitted inquiry rendered "Not sent yet" above its own receipt.
  const threadStateInput = {
    extrasEnabled,
    inquiryRecordExists: Boolean(inquiryRecordExists),
    contactPromoted,
    hasReceipt: receipt != null,
    hasSentMessage: hasSentGuestMessage(rows),
    showGate,
    showSentAirlock,
  };
  const isPrivateDraft = isPrivateDraftThread(threadStateInput);

  // DOCK v2: the "Add details" affordance replaces the always-visible chip row.
  // It renders on the unified path once an intent exists.
  const detailsEnabled = !showGate && extrasEnabled && inquiryIntent !== null;
  // The SendToAgencyBar is showing (an un-sent draft) whenever the parent supplies
  // onSendToAgency; the save-card must not co-render with it (P1-10).
  const sendBarActive = !showGate && extrasEnabled && Boolean(onSendToAgency);

  // DOCK v2: the 4-view dock (Home · Chat · Lineup · Projects) driven by a bottom
  // tab bar. Enabled on the unified path with a wired handler, never at the gate
  // (its own focused moment). Home is the landing hub; Chat renders the
  // conversation stack; Lineup/Projects render their roster/inquiry surfaces.
  const dockEnabled = extrasEnabled && !showGate && Boolean(onDockViewChange);
  const activeDockView: GuestDockView = dockEnabled ? dockView : "chat";
  const draftExists = Boolean(inquiryRecordExists) && !contactPromoted;

  // "Start an inquiry" (Home card + Lineup CTA): resume a live DRAFT in Chat;
  // when the active thread is already SENT, spin up a FRESH draft instead so
  // the guest never types into a frozen conversation. The lineup cart carries
  // over through the remount.
  const startInquiryInChat = () => {
    if (!draftExists && inquiryRecordExists && contactPromoted && onStartFresh) {
      onStartFresh();
      return;
    }
    onDockViewChange?.("chat");
  };

  const dock = useGuestDockModel({ rows, v5, refresh: onRefreshThread, threadStatus, brand, t, C, accent, accentInk, inquiryId, onOpenInquiry: (id) => { onSwitchInquiry(id); onDockViewChange?.("chat"); }, onAsk: (text) => onDraftChange(text), contactName: `${firstName} ${lastName}`.trim(), contactEmail: guestContactEmail, contactPhone: phone.trim() || capturedChipValues?.contact?.contactPhone || inquiryIntent?.requester?.phone || null, onRenameSaved: (n) => { onFirstNameChange(n); onLastNameChange(""); } });
  const [detailsOpen, setDetailsOpen] = useState(false); // header-triggered sheet
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // The header's status line has THREE states, not two. A guest who has opened
  // the panel without starting anything has no thread at all; reporting that as
  // "Sent, awaiting reply" would be a flat lie about what the agency has.
  const headerThreadState: GuestHeaderThreadState = guestHeaderThreadState(threadStateInput);
  const detailsProgress = detailsEnabled && inquiryIntent ? countCoreDetails(inquiryIntent, capturedChipValues) : null;
  const { offerPreview, journeyLabel, railLabel, journeySegs, frontDoorChrome } = useGuestDockJourney({
    brand,
    inquiryIntent,
    capturedChipValues,
    threadStatus,
    inquiryId,
    receipt: receipt != null,
    contactPromoted,
    cartTalentCount: cartTalentNames.length,
    v5,
    rows,
    t,
    isHub,
  });
  const openDetails =
    detailsEnabled && (activeDockView === "chat" || activeDockView === "home")
      ? () => setDetailsOpen(true)
      : null;
  return (
    <>
      <GuestDockChrome
        brand={brand}
        accent={accent}
        accentInk={accentInk}
        talentFirst={talentFirst}
        C={C}
        surfaceMode={surfaceMode}
        threadState={headerThreadState}
        journeyLabel={journeyLabel}
        syncState={syncState}
        onRetrySync={onRetrySync}
        onToggleExpand={onToggleExpand}
        expanded={expanded}
        onOpenSwitcher={
          dockEnabled && activeDockView === "chat" && !journeyLabel
            ? () => setSwitcherOpen(true)
            : null
        }
        onOpenDetails={openDetails}
        detailsFilled={detailsProgress?.filled ?? 0}
        detailsTotal={detailsProgress?.total ?? 0}
        railLabel={railLabel}
        journeySegs={journeySegs}
        dockEnabled={dockEnabled}
        activeDockView={activeDockView}
        onDockViewChange={onDockViewChange}
        lineupCount={cartTalentNames.length}
        projectsCount={inquiries.length}
        t={t}
        onClose={onClose}
        card={card}
      />

      <GuestThreadSwitcherDrawer
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        inquiries={inquiries}
        activeInquiryId={inquiryId}
        seenAtByInquiry={seenAtByInquiry}
        accent={accent}
        accentInk={accentInk}
        agencyName={brand.agencyName}
        surfaceMode={surfaceMode}
        t={t}
        onSelect={(id) => {
          setSwitcherOpen(false);
          if (id !== inquiryId) onSwitchInquiry(id);
          onDockViewChange?.("chat");
        }}
        onStartNew={() => {
          setSwitcherOpen(false);
          startInquiryInChat();
        }}
      />

      {/* Home hub */}
      {activeDockView === "home" && (
        <GuestDockHomeView
          brand={brand}
          accent={accent}
          accentInk={accentInk}
          talentFirst={talentFirst}
          C={C}
          surfaceMode={surfaceMode}
          t={t}
          identity={identity}
          draftExists={draftExists}
          inquiriesCount={inquiries.length}
          lineupCount={cartTalentNames.length}
          onStartInquiry={startInquiryInChat}
          onOpenProjects={() => onDockViewChange?.("projects")}
          onOpenLineup={() => onDockViewChange?.("lineup")}
          dashboardHref={dashboardHref}
          inquiryId={inquiryId}
          guestEmail={guestContactEmail}
          onAddClaimEmail={onAddClaimEmail}
          onCheckClaimEmail={onCheckClaimEmail}
          onGuestEmailUpdated={onGuestEmailUpdated}
          {...dock.detailsProps}
          {...dock.bookAgainHome}
        />
      )}

      {/* Lineup */}
      {activeDockView === "lineup" && (() => {
        const lineup = (
          <GuestDockLineupView
            accent={accent}
            accentInk={accentInk}
            surfaceMode={surfaceMode}
            t={t}
            sourcePage={sourcePage}
            onRemoveCartTalent={onRemoveCartTalent}
            onStartInquiry={card ? undefined : startInquiryInChat}
            {...dock.lineupItemsProps}
            catalog={card && (brand.dockServiceMenu?.length ?? 0) > 0 ? null : dock.catalogProps({ tenantSlug, inquiryId, sourcePage, onEnsureInquiry: onEnsureInquiryForItems, onAsk: (text) => { onDraftChange(text); onDockViewChange?.("chat"); } })}
          />
        );
        return card ? (
          <CardDockServicesView
            offerings={offerings}
            locale={brand.locale ?? "en"}
            t={t}
            selectionCount={cartTalentNames.length + (v5?.items?.lines.length ?? 0)}
            sending={sending || inCooldown}
            onSend={onSendToAgency ?? startInquiryInChat}
            onBackToChat={() => onDockViewChange?.("chat")}
            onAdded={onClose}
            menu={brand.dockServiceMenu}
          >
            {lineup}
          </CardDockServicesView>
        ) : lineup;
      })()}

      {/* Projects */}
      {activeDockView === "projects" && (
        <GuestDockProjectsView
          inquiries={inquiries}
          activeInquiryId={inquiryId}
          seenAtByInquiry={seenAtByInquiry}
          accent={accent}
          agencyName={brand.agencyName}
          surfaceMode={surfaceMode}
          t={t}
          onSelect={(id) => {
            onSwitchInquiry(id);
            onDockViewChange?.("chat");
          }}
          onBookAgain={dock.onBookAgainInquiry}
          onBrowseServices={card ? () => onDockViewChange?.("lineup") : undefined}
        />
      )}

      {activeDockView === "chat" && (
        <>
      {card && !showGate ? <CardDockBackToBooking locale={brand.locale ?? "en"} t={t} onBack={onClose} /> : null}
      {/* Conversation body — or dev `?hablar_preview=offer` DoR OFERTA fixture. */}
      {offerPreview ? (
        <GuestHablarOfferPreview
          accent={accent}
          accentInk={accentInk}
          C={C}
          locale={brand.locale ?? "es"}
          businessName={brand.agencyName}
          presenceName={talentFirst}
        />
      ) : (
      <GuestConversationBody
        scrollRef={scrollRef}
        C={C}
        showSentAirlock={showSentAirlock}
        brand={brand}
        accent={accent}
        accentInk={accentInk}
        t={t}
        surfaceMode={surfaceMode}
        pulseActive={pulseActive}
        receipt={receipt}
        talentPickFirst={talentPickFirst}
        talentFirst={talentFirst}
        rows={rows}
        limitNudge={limitNudge}
        onAddClaimEmail={onAddClaimEmail}
        onCheckClaimEmail={onCheckClaimEmail}
        inquiryId={inquiryId}
        guestContactEmail={guestContactEmail}
        emailedTo={emailedTo}
        onGuestEmailUpdated={onGuestEmailUpdated}
        identity={identity}
        threadStatus={threadStatus}
        cardModel={dock.cardModel}
        now={dock.now}
        sendBarActive={sendBarActive}
        cardIntro={card ? <CardDockIntro greeting={card.customGreeting?.trim() || interpolate(t("public.guestChat.cardGreeting"), { name: talentFirst || brand.talentDisplayName || brand.agencyName })} /> : undefined}
      />
      )}

      {showGate && (
        <MiniChatGateForm
          t={t}
          talentFirst={talentFirst}
          lineupRecap={buildGateLineupRecap(
            cartTalentNames,
            brand.agencyName,
            t,
          )}
          draft={draft}
          firstName={firstName}
          onFirstNameChange={onFirstNameChange}
          lastName={lastName}
          onLastNameChange={onLastNameChange}
          email={email}
          onEmailChange={onEmailChange}
          accent={accent}
          accentInk={accentInk}
          gateReady={gateReady}
          emailNotice={gateEmailNotice}
          emailBlocksSubmit={gateEmailBlocksSubmit}
          sending={sending}
          surfaceMode={surfaceMode}
          onSend={onFirstSend}
        />
      )}

      {!showGate && <GuestComposerNotices captchaRequired={captchaRequired} error={error} inCooldown={inCooldown} cooldownSecs={cooldownSecs} C={C} t={t} />}

      {/* U4 / P1: LEGACY detail chips (no unified inquiry); see GuestLegacyDetailChips. */}
      {!showGate && !extrasEnabled && (
        <GuestLegacyDetailChips
          inquiryId={inquiryId}
          identity={identity}
          tenantSlug={tenantSlug}
          talentProfileId={talentProfileId}
          accent={accent}
          accentInk={accentInk}
          t={t}
          surfaceMode={surfaceMode}
          capturedChipKinds={capturedChipKinds}
          capturedChipValues={capturedChipValues}
          chipFieldState={chipFieldState}
          chipRemoteFlashKinds={chipRemoteFlashKinds}
          onPatchChip={onPatchChip}
          onCaptureChip={onCaptureChip}
          onCapturedChipKind={onCapturedChipKind}
        />
      )}

      {/* Jon 360 CONVERSATION strip: "whose turn / what is next", above the
          composer; self-gates to the post-send window (see component). */}
      <ConversationStatusStrip
        threadStatus={threadStatus}
        receipt={receipt}
        agencyName={brand.agencyName}
        omitPlatformBrand={Boolean(brand.omitPlatformBrand)}
        rows={rows}
        scrollRef={scrollRef}
        suppressed={showGate || showSentAirlock}
        accent={accent}
        t={t}
        surfaceMode={surfaceMode}
      />

      {/* ── DOCK v2: details behind ONE slim "Add details" button (unified
          path). Every field + the AI scan live in the sheet it opens. ────── */}
      {detailsEnabled && inquiryIntent && (
        <GuestDetailsControl
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          hideTrigger
          intent={inquiryIntent}
          accent={accent}
          accentInk={accentInk}
          t={t}
          surfaceMode={surfaceMode}
          tenantSlug={tenantSlug}
          capturedValues={capturedChipValues}
          onListRoster={onListRoster}
          onPatchChip={(kind, value) => {
            if (onPatchChip) void onPatchChip(kind, value);
          }}
          onTalentChange={onTalentChange}
          onBriefChange={onBriefChange}
          onContactChange={onContactChange}
          onScanConversation={onScanConversation}
          composerDraft={draft}
          inquiryId={inquiryId}
          openToSection={railOpenToSection}
          onConsumeOpenTo={onConsumeRailOpenTo}
        />
      )}

      {!showGate && !inquiryId ? (
        <GuestHandoffContactStrip label={t("public.guestChat.handoffContactLabel")} name={`${firstName} ${lastName}`.trim()} email={email} phone={phone} surfaceMode={surfaceMode} />
      ) : null}
      <GuestComposerOfferingStrip
        showGate={showGate}
        offerPreview={offerPreview}
        threadStatus={threadStatus}
        offerings={offerings}
        onPickOffering={card ? undefined : onPickOffering}
        onDraftChange={onDraftChange}
        draft={draft}
        locale={brand.locale ?? "en"}
        t={t}
        accent={accent}
        surfaceMode={surfaceMode}
        v5={v5}
        hideAskCard={Boolean(card)}
      />

      {card && !showGate ? <CardDockAskFooter t={t} threadEmpty={rows.every((m) => m.authorRole === "system")} onPick={(q) => { onDraftChange(q); textareaRef.current?.focus(); }} /> : null}

      {!showGate && (brand.dockCardsV5 === true || dock.nextStepProps.bookAgainNotice) && <GuestNextStep {...dock.nextStepProps} />}

      {!showGate && (
        <MiniChatComposer
          draft={draft}
          onDraftChange={onDraftChange}
          honeypot={honeypot}
          onHoneypotChange={onHoneypotChange}
          onSubmit={onSubmit}
          placeholder={card && !inquiryId ? t("public.guestChat.cardComposerPlaceholder") : guestComposerPlaceholder(t, {
            frontDoorChrome,
            agencyPublicSurface: Boolean(brand.agencyPublicSurface),
            inquiryId,
            offerPreview,
            threadStatus,
          })}
          sending={sending}
          inCooldown={inCooldown}
          sendDisabled={sendDisabled}
          accent={accent}
          accentInk={accentInk}
          surfaceMode={surfaceMode}
          textareaRef={textareaRef}
        />
      )}

      {!showGate && extrasEnabled && onSendToAgency && !threadStateInput.hasSentMessage && !guestThreadBlocksSendBar(rows) && (
        <SendToAgencyBar
          accent={accent}
          accentInk={accentInk}
          t={t}
          isHub={isHub || Boolean(brand.omitPlatformBrand)}
          brandName={brand.agencyName}
          surfaceMode={surfaceMode}
          disabled={sending || inCooldown}
          sent={sentNote}
          typicalReply={typicalReply}
          onSend={onSendToAgency}
        />
      )}
        </>
      )}

    </>
  );
}
