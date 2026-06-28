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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { TalentChatLauncherProps } from "@/lib/inquiry/guest-chat-contract";
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

import {
  trackChatOpened,
  trackLineupAdd,
  trackLineupRemove,
  type Jon360FunnelContext,
} from "@/lib/analytics/jon360-funnel-events";

import { MiniChatPanel } from "./MiniChatPanel";
import { LauncherProjectPicker } from "./LauncherProjectPicker";
import { NewMessagePulse } from "./NewMessagePulse";
import { LauncherAvatarStack } from "./LauncherAvatarStack";
import { FlyingAvatar } from "./FlyingAvatar";
import { useFlyToRail } from "./use-fly-to-rail";
import { useCartTalents } from "./use-cart-talents";
import { useCartTalentRegistry } from "./cart-talent-registry";
import { useResolveCartPortraits } from "./use-resolve-cart-portraits";
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
  prefill = null,
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
}: TalentProfileChatLauncherLocalProps) {
  const mounted = useClientMounted();
  const [open, setOpen] = useState(false);
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
  // Phase 8 returning-visitor REPLIED pulse — a one-shot rising edge the pill's
  // NewMessagePulse consumes. Fired ~1.2s after mount when a returning visitor
  // lands with an unread coordinator reply on a CLOSED launcher, so the pulse
  // dot draws the eye to "{agency} replied". Cleared once the visitor opens the
  // panel (they have now seen the reply).
  const [repliedPulse, setRepliedPulse] = useState(false);

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

  // Restore the open panel across a refresh (B1) so the conversation doesn't
  // appear to reset. sessionStorage is per-tab → a refresh restores; closing the
  // tab forgets. Only auto-restore when there's a LIVE thread to show — never
  // auto-open an empty intro chat, which would read as spammy (strategy §10).
  const openStateKey = `tulala_guestchat_open:${talentProfileId}`;
  useEffect(() => {
    if (!existingInquiryId) return;
    try {
      if (sessionStorage.getItem(openStateKey) === "1") setOpen(true);
    } catch {
      /* sessionStorage blocked (some privacy modes) — stay closed, no-op. */
    }
    // existingInquiryId + openStateKey are stable for a given mount, so this
    // restores once and never re-opens after the user manually closes.
  }, [existingInquiryId, openStateKey]);
  useEffect(() => {
    try {
      if (open) sessionStorage.setItem(openStateKey, "1");
      else sessionStorage.removeItem(openStateKey);
    } catch {
      /* ignore — persistence is best-effort. */
    }
  }, [open, openStateKey]);

  // Phase 3 — announce this launcher to the shared modal context so a repointed
  // front door's requestOpenChat() targets the chat surface (and falls back to
  // the legacy sheet only when no launcher is mounted).
  const registerChatLauncher = inquiryModal?.registerChatLauncher;
  useEffect(() => {
    if (!registerChatLauncher) return;
    return registerChatLauncher();
  }, [registerChatLauncher]);

  // Phase 3 — open this panel when a repointed directory front door asks for it
  // (the cue is a monotonically-increasing counter; the initial 0 is ignored so
  // the panel never auto-opens on mount). This is what makes the chat launcher
  // the single canonical inquiry surface.
  const lastOpenChatCue = useRef(openChatCue);
  useEffect(() => {
    if (openChatCue === 0) return;
    if (openChatCue === lastOpenChatCue.current) return;
    lastOpenChatCue.current = openChatCue;
    setOpen(true);
  }, [openChatCue]);

  // Stable names array — cartTalents is already identity-stable (useCartTalents
  // memoizes on its signature), so this yields a stable reference and avoids
  // forcing the whole MiniChatPanel subtree to reconcile on every parent render.
  const cartTalentNames = useMemo(
    () => cartTalents.map((t) => t.displayName),
    [cartTalents],
  );

  // Phase 0c CRO — the standard Jon-360 funnel context, rebuilt per render from
  // the live cart. liveInquiryIdRef tracks the early-row id once it exists.
  const funnelCtx = useCallback(
    (): Jon360FunnelContext => ({
      inquiryId: liveInquiryIdRef.current,
      tenantId,
      lineupCount: cart.cartCount,
      identity: ctaIdentity,
      source: sourcePage,
    }),
    [tenantId, cart.cartCount, ctaIdentity, sourcePage],
  );

  // Phase 0c CRO — lineup_add / lineup_remove from a single cartIds diff so both
  // the rail X and a directory card "+" route through one firing point (no
  // double-count). Skips the initial mount snapshot (restored saved_talent ids
  // are not fresh adds).
  const prevCartIdsRef = useRef<readonly string[] | null>(null);
  useEffect(() => {
    const prev = prevCartIdsRef.current;
    const next = cart.cartIds;
    prevCartIdsRef.current = next;
    if (prev === null) return; // first snapshot — not a user action
    const prevSet = new Set(prev);
    const nextSet = new Set(next);
    for (const id of next) {
      if (!prevSet.has(id)) trackLineupAdd(funnelCtx(), id);
    }
    for (const id of prev) {
      if (!nextSet.has(id)) trackLineupRemove(funnelCtx(), id);
    }
  }, [cart.cartIds, funnelCtx]);

  // Phase 0c CRO — chat_opened once per open transition (not on every render
  // while open). Covers every open path (pill click, +N chip, restored session,
  // repointed front-door cue).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) trackChatOpened(funnelCtx());
    prevOpenRef.current = open;
  }, [open, funnelCtx]);

  // Phase 8 — REPLIED pulse one-shot. When a returning visitor lands with an
  // unread coordinator reply and the launcher is still closed, fire the pulse
  // once shortly after mount (a beat so it reads as "new", not a flash on paint).
  // Opening the panel marks the reply seen and suppresses the pulse. The fired
  // flag below is reset to false right after so NewMessagePulse only sees a
  // single false->true->false rising edge. Reduced-motion is handled inside the
  // pulse (it degrades to a static highlight), so no extra guard here.
  const repliedPulseFiredRef = useRef(false);
  useEffect(() => {
    if (!unreadCoordinatorReply || open || repliedPulseFiredRef.current) return;
    repliedPulseFiredRef.current = true;
    const fire = window.setTimeout(() => setRepliedPulse(true), 1200);
    const settle = window.setTimeout(() => setRepliedPulse(false), 1900);
    return () => {
      window.clearTimeout(fire);
      window.clearTimeout(settle);
    };
  }, [unreadCoordinatorReply, open]);

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
  });
  // Brand voice for the empty / replied / closed states. The launcher reads as
  // "Message {agency}" when empty (locked decision 1 — the lifecycle-aware label
  // OWNS the pill copy now; the legacy static `label` prop no longer overrides
  // it, so a stale "Book Now" never wins over the resolver state).
  const brandVoice = brand.agencyName?.trim() || talentFirst;
  // Phase 8 — forward the live lineup count so a resumed STALE draft reads
  // "Finish your inquiry (N)" (the resume_draft state carries no count itself).
  const launcherLabel = launcherLabelForCta(ctaState, t, brandVoice, cart.cartCount);
  // When the label already reads "Your lineup (N)" the separate count chip is a
  // duplicate number on the same pill — suppress it in that case.
  const labelShowsCount =
    (ctaState.kind === "in_lineup" ||
      ctaState.kind === "add_to_lineup" ||
      ctaState.kind === "review_lineup") &&
    cart.cartCount > 0;

  if (!mounted) return null;

  // Finding #4: activate the already-coded A.9 mobile geometry (32px avatars,
  // -11px overlap, max 2, always-visible 18px X) on touch devices. Read once at
  // render after the mount guard so matchMedia is never touched on the server.
  const isCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer:coarse)").matches;

  const hasCart = cartTalents.length > 0;

  return (
    <>
      {/* Card → pill fly clone (body portal, very high z). Idle/reduced-motion → null. */}
      <FlyingAvatar flight={flight} onDone={onFlightDone} />

      {/* Floating launcher pill wrapper. Bottom-right, above the panel's anchor.
          When the cart is non-empty the avatar rail breaks the TOP edge of the
          pill, so the wrapper gets a top margin to keep overhanging circles from
          clipping the viewport (plan §4.A.3). */}
      <div
        style={{
          position: "fixed",
          right: "max(16px, env(safe-area-inset-right))",
          bottom: `calc(${GUEST_CHAT_LAUNCHER_BOTTOM_PX}px + env(safe-area-inset-bottom))`,
          zIndex: 95,
          marginTop: hasCart ? 18 : 0,
        }}
      >
        {/* The avatar cart — only renders when the cart is non-empty (§4.A.8).
            Absolutely positioned breaking the pill's top edge; newest rightmost. */}
        {!open && hasCart && (
          <div
            style={{
              position: "absolute",
              top: -16,
              right: 12,
              zIndex: 1,
            }}
          >
            <LauncherAvatarStack
              cartTalents={cartTalents}
              onRemoveTalent={handleRemoveTalent}
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
          {!open && unreadCoordinatorReply && (
            <NewMessagePulse active={repliedPulse} accent={accent} />
          )}
          {open ? (
            <CloseGlyph color={accentInk} />
          ) : (
            <ChatGlyph color={accentInk} />
          )}
          <span>{open ? "Close" : launcherLabel}</span>
          {/* Jon 360 Phase 7 — cart count chip ON the pill. Shows how many talents
              are in the inquiry cart (only when closed + non-empty). Frosted neutral
              chip so it reads on any accent without re-clamping. */}
          {!open && hasCart && !labelShowsCount && (
            <span
              aria-hidden
              style={{
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                marginLeft: 1,
                borderRadius: 10,
                background: "rgba(255,255,255,0.22)",
                color: accentInk,
                border: "1px solid rgba(255,255,255,0.4)",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: "18px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            >
              {cartTalents.length}
            </span>
          )}
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
        surfaceMode={surfaceMode}
        existingInquiryId={existingInquiryId}
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

function ChatGlyph({ color }: { color: string }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseGlyph({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
