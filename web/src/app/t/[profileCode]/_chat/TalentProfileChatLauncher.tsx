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

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { TalentChatLauncherProps } from "@/lib/inquiry/guest-chat-contract";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { createTranslator } from "@/i18n/messages";

import { MiniChatPanel } from "./MiniChatPanel";
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
} from "./mini-chat-styles";

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
  label,
  className,
  openFullHref = null,
}: TalentChatLauncherProps) {
  const mounted = useClientMounted();
  const [open, setOpen] = useState(false);
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

  function handleRemoveTalent(talentProfileId: string) {
    // Single source: removing here flips saved_talent, which propagates to the
    // rail + the form + any open panel's Talent selection.
    cart.setInCart({ talentProfileId, profileCode: "" }, false, sourcePage);

    // Keep the inquiry RECORD in sync with the cart on removal (finding #3): the
    // cart alone never patched interpreted_query.talent.selected_ids, so a removed
    // talent lingered on the inquiry and the agency still saw them. Patch the
    // record with the REMAINING ids (replace semantics — matches the in-chat path)
    // ONLY when a row already exists; otherwise removal is a pure cart op.
    const inquiryId = liveInquiryIdRef.current;
    if (!inquiryId || !onCaptureChip) return;
    const remainingIds = cart.cartIds.filter((id) => id !== talentProfileId);
    const remainingNames = cartTalents
      .filter((t) => remainingIds.includes(t.talentProfileId))
      .map((t) => t.displayName);
    void onCaptureChip({
      inquiryId,
      kind: "talent",
      value: {
        selectedIds: remainingIds,
        selectionMode: remainingIds.length > 0 ? "i_know_who" : "agency_recommends",
        selectedNames: remainingNames,
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

  // Stable names array — cartTalents is already identity-stable (useCartTalents
  // memoizes on its signature), so this yields a stable reference and avoids
  // forcing the whole MiniChatPanel subtree to reconcile on every parent render.
  const cartTalentNames = useMemo(
    () => cartTalents.map((t) => t.displayName),
    [cartTalents],
  );

  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);
  const talentFirst = firstNameOf(brand.talentDisplayName);
  // Guest UI locale rides along on `brand` (resolved server-side from the
  // tenant's default_locale, since guests have no LOCALE_COOKIE).
  const t = createTranslator(brand.locale ?? "en");
  const launcherLabel = label ?? `Message ${talentFirst}`;

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

        <button
          ref={pillRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={launcherLabel}
          aria-expanded={open}
          className={className}
          style={{
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
            boxShadow:
              "0 14px 34px -10px rgba(16,18,29,0.5), 0 4px 12px -4px rgba(16,18,29,0.3)",
            transition: "transform 140ms ease, box-shadow 140ms ease",
          }}
        >
          {open ? (
            <CloseGlyph color={accentInk} />
          ) : (
            <ChatGlyph color={accentInk} />
          )}
          <span>{open ? "Close" : launcherLabel}</span>
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
        onInquiryIdChange={(id) => {
          liveInquiryIdRef.current = id;
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
