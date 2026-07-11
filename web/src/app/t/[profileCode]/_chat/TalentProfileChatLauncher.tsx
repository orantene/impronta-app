"use client";

/**
 * TalentProfileChatLauncher — floating, brand-skinned chat launcher (Lane D / F1).
 *
 * Mounts as a sibling of TalentProfileInquireButton on /t/[profileCode]. It is
 * the acquisition skin: a floating "Message {Name}" pill (label overridable to
 * e.g. "Ask availability" via the `label` prop) that opens the MiniChatPanel
 * inline — no navigation, per strategy §3.1.
 *
 *   • Color comes from agency_branding (accentColor on brand) — NO hard-coded
 *     gold/rust (house rule). Falls back to a neutral ink token when null.
 *   • Owns the open/close state; the panel is controlled.
 *   • Imports NO backend module — the three server actions arrive as props and
 *     are forwarded straight to the panel (the security boundary, the guest
 *     cookie, is resolved server-side inside those actions).
 */

import { setPendingOffering } from "./pending-offering-store";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type {
  ScanGuestConversationCallback,
  TalentChatLauncherProps,
} from "@/lib/inquiry/guest-chat-contract";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";
import { createTranslator } from "@/i18n/messages";
import { withInterpolation } from "@/i18n/interpolate";
import {
  resolveInquiryCta,
  type LastMessageRole,
  type OtherOpenInquiry,
} from "@/lib/inquiry/inquiry-context-resolver";
import type { InquiryWorkflowPhase } from "@/lib/inquiry/inquiry-lifecycle";
import { launcherLabelForCta } from "@/lib/inquiry/launcher-cta-label";

import { MiniChatPanel } from "./MiniChatPanel";
import { LauncherProjectPicker } from "./LauncherProjectPicker";
import { NewMessagePulse } from "./NewMessagePulse";
import { LauncherAvatarStack } from "./LauncherAvatarStack";
import { FlyingAvatar } from "./FlyingAvatar";
import { useFlyToRail } from "./use-fly-to-rail";
import { useCartTalents } from "./use-cart-talents";
import { registerCartTalent, useCartTalentRegistry } from "./cart-talent-registry";
import { useResolveCartPortraits } from "./use-resolve-cart-portraits";
import { useNarrowLauncherViewport } from "./use-compact-viewport";
import { ChatGlyph, CloseGlyph } from "./chat-launcher-glyphs";
import { useLauncherSessionRestore } from "./use-launcher-session-restore";
import { useDirectoryFrontDoorSync } from "./use-directory-front-door-sync";
import { useJon360LauncherTracking } from "./use-jon360-launcher-tracking";
import {
  DEFAULT_ACCENT,
  GUEST_CHAT_LAUNCHER_BOTTOM_PX,
  firstNameOf,
  readableOn,
  type SurfaceMode,
} from "./mini-chat-styles";

// Jon 360 Phase 7 — `surfaceMode` is a LOCAL extension (the dark-surface signal
// derived from the tenant's resolved background.mode), NOT added to the shared
// read-only guest-chat-contract. Threaded launcher → panel.
type TalentProfileChatLauncherLocalProps = TalentChatLauncherProps & {
  surfaceMode?: SurfaceMode;
  /**
   * Phase 3 — lifecycle inputs for the resolver-driven pill label, resolved
   * server-side at the Mount seam (from getActiveGuestInquiry +
   * getGuestThreadMessages + listGuestInquiries) and passed as plain props so
   * the client bundle stays backend-free. All optional: when none are supplied
   * the resolver falls back to the lineup-only states (empty -> "Message X").
   */
  activePhase?: InquiryWorkflowPhase | null;
  activeStatus?: string | null;
  coordinatorId?: string | null;
  lastMessageRole?: LastMessageRole;
  lastActivityAt?: string | null;
  hasActiveDraft?: boolean;
  draftInquiryId?: string | null;
  otherOpenInquiries?: OtherOpenInquiry[];
  ctaIdentity?: "guest" | "client";
  /** DOCK v2 — forwarded to the panel: the AI conversation scan action. */
  onScanConversation?: ScanGuestConversationCallback | null;
  /**
   * P0-5 / W0-F — this launcher is mounted on a HUB host (platform/network hub
   * or the marketing apex), not an agency. Threaded to the panel so the SEND
   * path drops the "the agency" framing. Default false (agency + talent hosts).
   */
  isHub?: boolean;
  /**
   * Phase 8 returning-visitor REPLIED pulse — true when the active SENT inquiry
   * has an unread coordinator reply as its latest message (derived server-side
   * in launcher-lifecycle-inputs from the SAME thread read; no client refetch).
   * Drives the NewMessagePulse dot on the pill alongside "{agency} replied".
   */
  unreadCoordinatorReply?: boolean;
};

function subscribeNoop(): () => void {
  return () => undefined;
}

function useClientMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function TalentProfileChatLauncher({
  tenantSlug,
  tenantId = null,
  talentProfileId,
  talentProfileCode,
  sourcePage,
  brand,
  existingInquiryId = null,
  existingContactPromoted = null,
  prefill = null,
  offerings = [],
  onAttachOffering = null,
  onStartInquiry,
  onSendMessage,
  fetchMessages,
  onAddClaimEmail = null,
  onCheckClaimEmail = null,
  onListGuestInquiries = null,
  onCaptureChip = null,
  onEnsureInquiry = null,
  onLoadDetails = null,
  onListRoster = null,
  onResolveCartPortraits = null,
  onScanConversation = null,
  soundOnReply = true,
  identity = "guest",
  // `label` (legacy static override) is intentionally NOT destructured: the
  // lifecycle-aware resolver now owns the pill copy (locked decision 1).
  className,
  openFullHref = null,
  surfaceMode = "light",
  activePhase = null,
  activeStatus = null,
  coordinatorId = null,
  lastMessageRole = null,
  lastActivityAt = null,
  hasActiveDraft = false,
  draftInquiryId = null,
  otherOpenInquiries = [],
  ctaIdentity = "guest",
  unreadCoordinatorReply = false,
  isHub = false,
}: TalentProfileChatLauncherLocalProps) {
  const mounted = useClientMounted();
  const [open, setOpen] = useState(false);
  // W2-B — "seen" marker for the unseen-reply signal. Opening the panel means the
  // visitor has now seen the coordinator's reply, so we locally suppress the
  // replied label + pulse from that point on (the server recomputes the durable
  // "seen" state on the next load). Best-effort: a stuck "replied" that never
  // clears is the failure we must avoid, so any open flips this true for good.
  const [replySeen, setReplySeen] = useState(false);
  useEffect(() => {
    if (open) setReplySeen(true);
  }, [open]);
  // Audit item 7 (Lane G) — below ~700px the free-floating avatar cluster (up to
  // 3 circles breaking the pill's top edge, or the "+N …more" chip) has been
  // observed drifting over profile content (review text / section headers) in
  // real-browser testing. Below the threshold the cluster collapses into the
  // pill's own count badge instead of rendering as a separate floating stack.
  const narrowLauncher = useNarrowLauncherViewport();

  // Storefront CTA seam: a service card's "Book/Request/Ask for quote" opens
  // this launcher carrying the clicked offering (structured provenance +
  // visible "Requesting: …" first-message prefix downstream).
  useEffect(() => {
    const onOfferingRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === "object") setPendingOffering(detail);
      setOpen(true);
    };
    window.addEventListener("tulala:offering-request", onOfferingRequest);
    return () => window.removeEventListener("tulala:offering-request", onOfferingRequest);
  }, []);
  // Jon 360 Phase 7 — wire the pill's (previously dead) transform transition to a
  // real hover/active lift. Reduced-motion-safe: the transitions/transforms are
  // suppressed under prefers-reduced-motion below.
  const [pillHover, setPillHover] = useState(false);
  const [pillActive, setPillActive] = useState(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // F4: expanded state — grows the panel into a 2-pane layout in-place.
  const [expanded, setExpanded] = useState(false);
  // When the +N chip / a rail avatar is tapped, open the panel scrolled to the
  // Talent section. The panel reads this one-shot intent and clears it.
  const [openToTalent, setOpenToTalent] = useState(false);

  // ── The launcher pill IS the inquiry cart (plan §4.A) ──────────────────────
  // The rail's avatars are a pure projection of the single source of truth
  // (useInquiryCart().cartIds) joined with portrait/name data the directory cards
  // registered as they were added (cart-talent-registry). No second cart store.
  const cart = useInquiryCart();
  // Phase 6 — the public flash host (reused as the Undo toast surface). Optional:
  // null when no PublicDiscoveryState provider is mounted on this surface.
  const discovery = usePublicDiscoveryStateOptional();
  // Phase 3 — the canonical inquiry surface. Directory front doors (review bar,
  // header Send icon, ?inquiry=open) bump `openChatCue` on this shared context
  // to open THIS panel instead of the legacy InquiryDrawer sheet.
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const openChatCue = inquiryModal?.openChatCue ?? 0;
  const registry = useCartTalentRegistry();
  const cartTalents = useCartTalents(registry);
  // Cold-load backfill: cart ids restored from saved_talent aren't in the
  // (in-session-only) registry, so resolve their name + face once per missing set
  // and merge into the registry. Membership stays cartIds; this only fills photos
  // so every rail avatar is a face-focus portrait, not initials (§4.A.1 / §5.5).
  useResolveCartPortraits(tenantSlug, onResolveCartPortraits);
  const pillRef = useRef<HTMLButtonElement>(null);
  // Card → pill fly clone (reduced-motion-safe; no portal under reduce). The
  // flight is driven by the directory card's animateAdd payload via context.
  const { flight, onFlightDone } = useFlyToRail(pillRef);

  // Live inquiry id reported up by the panel (early-row create / resume / switch).
  // Stays null until a real structured commit creates a row, so a rail X-remove
  // never spawns a phantom inquiry — it only patches an EXISTING record.
  const liveInquiryIdRef = useRef<string | null>(existingInquiryId);
  // Render-readable mirror of liveInquiryIdRef, so components rendered in the tree
  // (e.g. the Phase 5 project picker) can read the current inquiry id during render
  // without touching the ref. The ref stays the source of truth for the imperative
  // paths (early-row create / remove runner); this just shadows it for render reads.
  const [liveInquiryId, setLiveInquiryId] = useState<string | null>(existingInquiryId);

  // DOCK v2 "start fresh": remount the panel WITHOUT the resumed (sent)
  // inquiry so the next interaction ensures a brand-new private draft. The
  // cart (lineup) survives — the new draft picks it up through the existing
  // preload bridge. An in-progress DRAFT is never discarded here; callers only
  // invoke this when the active thread is already sent (or absent).
  const [freshEpoch, setFreshEpoch] = useState(0);
  // When set, the remounted panel resumes THIS draft (the separate-inquiry
  // flow mints it server-side first); null = plain resume-suppressed fresh.
  const [freshOverrideId, setFreshOverrideId] = useState<string | null>(null);
  const startFreshDraft = useCallback(() => {
    try {
      window.sessionStorage.setItem("impronta.dockView", "chat");
    } catch {
      /* private mode */
    }
    setFreshOverrideId(null);
    setFreshEpoch((n) => n + 1);
  }, []);
  const resumeSuppressed = freshEpoch > 0;

  // DOCK v2.1 — "start a separate inquiry about {talent}" (profile CTA
  // chooser). The in-progress draft is NEVER lost: it is already autosaved
  // server-side on every change and stays reachable from the Inquiries tab.
  // Order matters: (1) mint the NEW draft first (forceNew ensure), so the cart
  // projection — which targets the NEWEST draft — can no longer touch the old
  // one; (2) reset the cart to just this talent; (3) remount the panel resumed
  // directly into the new draft.
  const separateReq = inquiryModal?.separateInquiryRequest ?? null;
  const separateSeqRef = useRef(0);
  useEffect(() => {
    if (!separateReq || separateReq.seq === separateSeqRef.current) return;
    separateSeqRef.current = separateReq.seq;
    const talent = separateReq.payload;
    if (!onEnsureInquiry) return;
    let cancelled = false;
    void (async () => {
      const res = await onEnsureInquiry({
        tenantSlug,
        talentProfileId: talent.talentProfileId,
        talentProfileCode: talent.profileCode || null,
        sourcePage,
        forceNew: true,
      });
      if (cancelled || !res.ok) return;
      registerCartTalent(talent.talentProfileId, {
        displayName: talent.displayName,
        portraitUrl: talent.portraitUrl,
      });
      for (const id of cart.cartIds) {
        if (id !== talent.talentProfileId) {
          cart.setInCart({ talentProfileId: id, profileCode: "" }, false, sourcePage);
        }
      }
      if (!cart.isInCart(talent.talentProfileId)) {
        cart.setInCart(
          {
            talentProfileId: talent.talentProfileId,
            profileCode: talent.profileCode,
            displayName: talent.displayName,
          },
          true,
          sourcePage,
        );
      }
      try {
        window.sessionStorage.setItem("impronta.dockView", "chat");
      } catch {
        /* private mode */
      }
      setFreshOverrideId(res.inquiryId);
      setFreshEpoch((n) => n + 1);
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
    // Re-runs on unrelated dep changes are no-ops: the seq guard above only
    // lets each request through once.
  }, [separateReq, onEnsureInquiry, tenantSlug, sourcePage, cart, setOpen]);

  // B6: the panel registers its unified talent-patch runner here so the rail
  // X-remove writes the record through the SAME useUnifiedInquiry.patch path the
  // in-chat ADD uses — giving remove the same saving-state + LOCAL_WRITE_GRACE_MS
  // self-echo window + retry guarantee. Calling onCaptureChip directly (the old
  // path) bypassed all of that and self-echoed every remove back to the guest.
  const removeTalentRunnerRef = useRef<
    | ((
        selectedIds: string[],
        selectionMode: "i_know_who" | "agency_recommends",
        selectedNames: string[],
      ) => void)
    | null
  >(null);

  function handleRemoveTalent(talentProfileId: string) {
    // Snapshot the pre-remove lineup so an Undo can restore BOTH the cart id and
    // the record selection exactly (captured before any mutation below).
    const removed = cartTalents.find((c) => c.talentProfileId === talentProfileId) ?? null;
    const idsBefore = [...cart.cartIds];
    const namesBefore = cartTalents
      .filter((c) => idsBefore.includes(c.talentProfileId))
      .map((c) => c.displayName);

    // Single source: removing here flips saved_talent, which propagates to the
    // rail + the form + any open panel's Talent selection.
    cart.setInCart({ talentProfileId, profileCode: "" }, false, sourcePage);

    // Keep the inquiry RECORD in sync with the cart on removal (finding #3): the
    // cart alone never patched interpreted_query.talent.selected_ids, so a removed
    // talent lingered on the inquiry and the agency still saw them. Route the
    // record write through the panel's unified.patch runner with the REMAINING ids
    // (replace semantics — IDENTICAL shape to the in-chat add path, so the grace
    // window is stamped and the remove never self-echoes). Only when a row already
    // exists; otherwise removal is a pure cart op.
    const inquiryId = liveInquiryIdRef.current;
    const runner = removeTalentRunnerRef.current;
    if (inquiryId && runner) {
      const remainingIds = cart.cartIds.filter((id) => id !== talentProfileId);
      const remainingNames = cartTalents
        .filter((c) => remainingIds.includes(c.talentProfileId))
        .map((c) => c.displayName);
      runner(
        remainingIds,
        remainingIds.length > 0 ? "i_know_who" : "agency_recommends",
        remainingNames,
      );
    }

    offerRemoveUndo(talentProfileId, removed, idsBefore, namesBefore);
  }

  // Phase 6 — reversible remove. While the inquiry is still a DRAFT (not yet sent
  // / contact not promoted), show a 5s Undo cue that restores BOTH the cart id
  // AND the record selection via the SAME unified.patch runner the remove used.
  // After SEND the removal goes through the conversation, so no Undo is offered
  // (the resolver's sent/terminal states gate this). Reuses the public flash host
  // (no new toast dependency).
  function offerRemoveUndo(
    removedId: string,
    removed: { displayName: string } | null,
    idsBefore: string[],
    namesBefore: string[],
  ) {
    if (!discovery) return;
    const sentKind =
      ctaState.kind === "sent_awaiting" ||
      ctaState.kind === "live_conversation" ||
      ctaState.kind === "terminal";
    if (sentKind) return;

    const tFlash = withInterpolation(t);
    const name = removed?.displayName?.trim() || tFlash("public.guestChat.sectionTalent");
    discovery.setFlash({
      tone: "info",
      durationMs: 5000,
      title: tFlash("public.guestChat.removedToast", { name }),
      action: {
        label: tFlash("public.guestChat.removedToastUndo"),
        onAction: () => {
          // Restore the cart id (single source -> rail + form re-mirror).
          cart.setInCart(
            { talentProfileId: removedId, profileCode: "", displayName: removed?.displayName },
            true,
            sourcePage,
          );
          // Restore the record selection through the SAME runner the remove used,
          // replaying the exact pre-remove id set (no phantom inquiry: the runner
          // is a no-op when no row exists, matching the remove path).
          const runner = removeTalentRunnerRef.current;
          if (liveInquiryIdRef.current && runner) {
            runner(
              idsBefore,
              idsBefore.length > 0 ? "i_know_who" : "agency_recommends",
              namesBefore,
            );
          }
        },
      },
    });
  }

  function handleOpenToTalent() {
    setOpenToTalent(true);
    setOpen(true);
  }

  // Restore the open panel across a refresh (B1). Extracted to
  // useLauncherSessionRestore (W1-A decomposition pre-pass).
  useLauncherSessionRestore({ existingInquiryId, talentProfileId, open, setOpen });

  // Phase 3 — directory front-door registration + repointed-cue open. Extracted
  // to useDirectoryFrontDoorSync (W1-A decomposition pre-pass).
  useDirectoryFrontDoorSync({
    registerChatLauncher: inquiryModal?.registerChatLauncher,
    openChatCue,
    setOpen,
  });

  // Stable names array — cartTalents is already identity-stable (useCartTalents
  // memoizes on its signature), so this yields a stable reference and avoids
  // forcing the whole MiniChatPanel subtree to reconcile on every parent render.
  const cartTalentNames = useMemo(
    () => cartTalents.map((t) => t.displayName),
    [cartTalents],
  );

  // Phase 0c CRO funnel firing (lineup_add/remove, chat_opened) + Phase 8
  // returning-visitor REPLIED pulse. Extracted to useJon360LauncherTracking
  // (W1-A decomposition pre-pass).
  const { repliedPulse } = useJon360LauncherTracking({
    tenantId,
    cartCount: cart.cartCount,
    cartIds: cart.cartIds,
    ctaIdentity,
    sourcePage,
    open,
    unreadCoordinatorReply,
    liveInquiryIdRef,
  });

  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);
  const talentFirst = firstNameOf(brand.talentDisplayName);
  // Guest UI locale rides along on `brand` (resolved server-side from the
  // tenant's default_locale, since guests have no LOCALE_COOKIE).
  const t = createTranslator(brand.locale ?? "en");

  // Phase 3 — lifecycle-aware pill label (locked decision 1). The resolver owns
  // the STATE; launcherLabelForCta owns the launcher copy. Lineup inputs come
  // from the live cart (cartIds/cartCount); the active-inquiry inputs (phase /
  // coordinator / last-message-role / drafts / other-open) were resolved
  // server-side at the Mount and arrive as plain props. A talent-focused
  // launcher passes its talentProfileId; the agency launcher passes "" -> null
  // focus, which maps to the lineup-review states.
  const focusTalentId = talentProfileId && talentProfileId.length > 0 ? talentProfileId : null;
  // W2-B — the live "unseen agency reply" signal: the server-derived flag, minus
  // any local open (which marks it seen). Drives BOTH the resolver's `replied`
  // state ("{agency} replied") and the pulse ring, so opening the thread clears
  // the label and the pulse together.
  const unseenAgencyReply = unreadCoordinatorReply && !replySeen;
  const ctaState = resolveInquiryCta({
    talentProfileId: focusTalentId,
    isInLineup: focusTalentId ? cart.isInCart(focusTalentId) : false,
    lineupCount: cart.cartCount,
    lineupTalentIds: [...cart.cartIds],
    contactPromoted: false,
    hasActiveDraft,
    draftInquiryId,
    activePhase,
    activeStatus,
    otherOpenInquiries,
    identity: ctaIdentity,
    lastActivityAt,
    coordinatorId,
    lastMessageRole,
    hasUnseenAgencyReply: unseenAgencyReply,
  });
  // Brand voice for the empty / replied / closed states. The launcher reads as
  // "Message {agency}" when empty (locked decision 1 — the lifecycle-aware label
  // OWNS the pill copy now; the legacy static `label` prop no longer overrides
  // it, so a stale "Book Now" never wins over the resolver state).
  const brandVoice = brand.agencyName?.trim() || talentFirst;
  // Phase 8 — forward the live lineup count so a resumed STALE draft reads
  // "Finish your inquiry (N)" (the resume_draft state carries no count itself).
  const launcherLabel = launcherLabelForCta(ctaState, t, brandVoice, cart.cartCount);

  if (!mounted) return null;

  // Finding #4: activate the already-coded A.9 mobile geometry (32px avatars,
  // -11px overlap, max 2, always-visible 18px X) on touch devices. Read once at
  // render after the mount guard so matchMedia is never touched on the server.
  const isCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer:coarse)").matches;

  const hasCart = cartTalents.length > 0;
  // Below the narrow threshold the avatar rail never renders (collapsed into
  // the pill's count badge below), so nothing breaks the pill's top edge and
  // the wrapper needs no reserved top margin for it.
  const showAvatarRail = !narrowLauncher && !open && hasCart;

  return (
    <>
      {/* Card → pill fly clone (body portal, very high z). Idle/reduced-motion → null. */}
      <FlyingAvatar flight={flight} onDone={onFlightDone} />

      {/* Floating launcher pill wrapper. Bottom-right, above the panel's anchor.
          W1-D — the wrapper is a bottom-anchored flex COLUMN (align to the right
          edge). The avatar rail, the pick-inquiry picker, and the pill are all
          in-flow children, so each reserves its own real vertical space: the rail
          no longer overhangs an out-of-flow, unreserved zone above a bottom-fixed
          box (the old `position:absolute; top:-16` + ineffective `marginTop:18`
          combo that both clipped the circles AND overlaid — and stole — clicks
          meant for the pill). The rail sits ABOVE the pill and only kisses its
          top edge (marginBottom:-6), so the pill button stays the topmost hit
          target at its own centre and label. Below ~700px the rail is suppressed
          entirely (audit item 7 — no floating cluster on narrow viewports). */}
      <div
        style={{
          position: "fixed",
          right: "max(16px, env(safe-area-inset-right))",
          bottom: `calc(${GUEST_CHAT_LAUNCHER_BOTTOM_PX}px + env(safe-area-inset-bottom))`,
          zIndex: 95,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        {/* The avatar cart — DISPLAY-ONLY count (faces + a single "+N"). Only when
            the cart is non-empty AND there is enough lateral room (§4.A.8 + audit
            item 7). In-flow above the pill (reserves its own height); newest
            rightmost. marginBottom:-6 lets the faces kiss the pill's top edge for
            the lifted look without covering the pill's clickable centre. */}
        {showAvatarRail && (
          <div
            style={{
              marginRight: 12,
              marginBottom: -6,
              position: "relative",
              zIndex: 1,
            }}
          >
            <LauncherAvatarStack
              cartTalents={cartTalents}
              onOpenToTalentSection={handleOpenToTalent}
              accent={accent}
              accentInk={accentInk}
              t={t}
              compact={isCoarsePointer}
            />
          </div>
        )}

        {/* Phase 5 pick_inquiry — the actionable project picker. Surfaced when the
            resolver yields pick_inquiry (focused talent + other open inquiries):
            the pill keeps its add-style label while THIS anchored popover lets the
            client add {firstName} to an existing inquiry or start a separate one.
            Only on a closed launcher with a focused talent + the injected actions;
            the in-chat talent picker owns adds once the panel is open. */}
        {!open &&
          ctaState.kind === "pick_inquiry" &&
          focusTalentId &&
          onListGuestInquiries &&
          onCaptureChip &&
          onEnsureInquiry && (
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
              <LauncherProjectPicker
                focusedTalentId={focusTalentId}
                focusedTalentCode={talentProfileCode}
                firstName={talentFirst}
                displayName={brand.talentDisplayName}
                otherOpenInquiries={ctaState.otherOpenInquiries}
                tenantSlug={tenantSlug}
                sourcePage={sourcePage}
                currentInquiryId={liveInquiryId}
                accent={accent}
                surfaceMode={surfaceMode}
                t={t}
                onListGuestInquiries={onListGuestInquiries}
                onCaptureChip={onCaptureChip}
                onEnsureInquiry={onEnsureInquiry}
              />
            </div>
          )}

        <button
          ref={pillRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setPillHover(true)}
          onMouseLeave={() => {
            setPillHover(false);
            setPillActive(false);
          }}
          onMouseDown={() => setPillActive(true)}
          onMouseUp={() => setPillActive(false)}
          aria-label={launcherLabel}
          aria-expanded={open}
          className={className}
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            height: 52,
            padding: "0 20px 0 18px",
            borderRadius: 26,
            border: "none",
            background: accent,
            color: accentInk,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 0.1,
            cursor: "pointer",
            // Lift on hover, press in on active. Reduced-motion → no transition +
            // no transform (the box is static for motion-sensitive visitors).
            boxShadow: pillHover
              ? "0 20px 44px -10px rgba(16,18,29,0.55), 0 6px 16px -4px rgba(16,18,29,0.35)"
              : "0 14px 34px -10px rgba(16,18,29,0.5), 0 4px 12px -4px rgba(16,18,29,0.3)",
            transform: reduceMotion
              ? "none"
              : pillActive
                ? "translateY(0) scale(0.98)"
                : pillHover
                  ? "translateY(-2px)"
                  : "none",
            transition: reduceMotion
              ? "none"
              : "transform 140ms ease, box-shadow 140ms ease",
          }}
        >
          {/* Phase 8 — REPLIED pulse. Reuses NewMessagePulse, mounted inside the
              pill so the accent ring traces the pill's rounded rect (borderRadius
              inherits). Only meaningful on the closed launcher with an unread
              coordinator reply; the component self-fires one ring per false->true
              edge and is reduced-motion-safe (degrades to a static highlight). */}
          {!open && unseenAgencyReply && (
            <NewMessagePulse active={repliedPulse} accent={accent} />
          )}
          {open ? (
            <CloseGlyph color={accentInk} />
          ) : (
            <ChatGlyph color={accentInk} />
          )}
          <span>{open ? "Close" : launcherLabel}</span>
          {/* W1-D — the separate cart count chip (the "9" bubble) was REMOVED. It
              double-counted against the avatar stack (faces + a single "+N" chip
              ARE the count) and, in states like `sent_awaiting`, `labelShowsCount`
              left BOTH visible. The count is now carried by the faces, or — when
              there are no faces — by the label's own "(N)" in the lineup states. */}
        </button>
      </div>

      {/* Faint scrim behind the panel when expanded (non-blocking — aria-modal="false") */}
      {open && expanded && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 88,
            background: "rgba(16,18,29,0.18)",
            pointerEvents: "none",
          }}
        />
      )}

      <MiniChatPanel
        offerings={offerings}
        onAttachOffering={onAttachOffering}
        open={open}
        onClose={() => {
          setOpen(false);
          setExpanded(false);
        }}
        expanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
        tenantSlug={tenantSlug}
        tenantId={tenantId}
        talentProfileId={talentProfileId}
        talentProfileCode={talentProfileCode}
        sourcePage={sourcePage}
        brand={brand}
        isHub={isHub}
        surfaceMode={surfaceMode}
        key={freshEpoch}
        existingInquiryId={resumeSuppressed ? freshOverrideId : existingInquiryId}
        existingContactPromoted={resumeSuppressed ? (freshOverrideId ? false : null) : existingContactPromoted}
        onStartFresh={startFreshDraft}
        prefill={prefill}
        onStartInquiry={onStartInquiry}
        onSendMessage={onSendMessage}
        fetchMessages={fetchMessages}
        onAddClaimEmail={onAddClaimEmail}
        onCheckClaimEmail={onCheckClaimEmail}
        onListGuestInquiries={onListGuestInquiries}
        onCaptureChip={onCaptureChip}
        onEnsureInquiry={onEnsureInquiry}
        onLoadDetails={onLoadDetails}
        onListRoster={onListRoster}
        onScanConversation={onScanConversation}
        soundOnReply={soundOnReply}
        identity={identity}
        openFullHref={openFullHref}
        cartTalentIds={cart.cartIds}
        cartTalentNames={cartTalentNames}
        openToTalentSection={openToTalent}
        onConsumeOpenToTalentSection={() => setOpenToTalent(false)}
        onRemoveCartTalent={handleRemoveTalent}
        onRegisterRemoveTalent={(runner) => {
          removeTalentRunnerRef.current = runner;
        }}
        onInquiryIdChange={(id) => {
          liveInquiryIdRef.current = id;
          setLiveInquiryId(id);
        }}
      />
    </>
  );
}
