"use client";

/**
 * Drawer Help Registry — single source of truth for in-app drawer
 * explanations, support article URLs, chatbot Q&A pairs, and ticket
 * routing categories.
 *
 * For the bigger picture — audit findings, 25-workstream execution
 * plan, designer + engineer handoff packages — see ROADMAP.md in this
 * directory. The page-builder management plane (which integrates with
 * a separate front-end editor codebase and supports hybrid-user
 * context-switching) is tracked as workstream WS-27.
 *
 * Usage:
 *  - DrawerShell auto-renders an ⓘ button + slide-down HelpPanel when
 *    `getHelp(drawerId)` returns an entry.
 *  - DRAWERS.md is generated from this same registry (run the script in
 *    scripts/gen-drawers-doc.ts — same shape, just serialized).
 *  - Future support pages will live at `/support/<supportSlug>` and read
 *    the same `purpose` + `youCanHere` + `faqs` fields.
 *  - The chat Q&A bot looks up `faqs` keyed by drawer; if no match, it
 *    falls back to the registry's free-text search over `purpose`.
 *  - The ticket form pre-fills `category` from `ticketCategory`.
 *
 * Writing style:
 *  - `purpose` — one sentence, plain language, no jargon. Answers
 *    "what is this thing" for someone who has never seen it.
 *  - `youCanHere` — 3–5 bullets, imperative verbs ("Reply…", "Send…"),
 *    each describes a concrete action a user can take in this view.
 *  - `relatedDrawers` — 2–3 logical jumps, never exhaustive.
 *  - `audience` — one or many. Drives the eyebrow chip color and the
 *    "who's this for" filter on the support index.
 */

import { Fragment, useEffect, useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";

import { COLORS, FONTS, useAdminShell, type DrawerId } from "./state";
import {
  DRAWER_HELP,
  type Audience,
  type HelpEntry,
} from "./help-registry";

export { DRAWER_HELP, type Audience, type HelpEntry };

// ─── i18n plumbing ───────────────────────────────────────────────────
//
// The registry below keeps its English copy inline: it is the fallback
// for non-UI consumers (DRAWERS.md generation, the free-text search in
// the chatbot, tests) and the source of truth reviewers read. Every
// rendered string additionally resolves through the message catalog
// under `dashboard.adminHelp.*`, keyed by drawer id, so a Spanish
// dashboard shows Spanish help.
//
// Catalog keys are derived from the drawer id rather than stored as
// per-entry `*Key` fields: with 150+ entries and ~630 strings, derived
// keys keep the registry readable and make it impossible for a key
// field to drift out of sync with the entry it belongs to.

const HELP_NS = "dashboard.adminHelp";

type T = (key: string) => string;

/**
 * `createTranslator` returns the key itself when a catalog entry is
 * missing, which would render a raw dot-path. Fall back to the English
 * copy carried by the registry instead.
 */
function tOr(t: T, key: string, fallback: string): string {
  const resolved = t(key);
  return resolved === key ? fallback : resolved;
}

/** "Public site & domains" → "publicSiteDomains". Stable catalog segment. */
function catalogSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
}

// ─── Public API ──────────────────────────────────────────────────────

/** Look up help for a drawer. Returns null if no entry exists yet. */
export function getHelp(id: DrawerId | null | undefined): HelpEntry | null {
  if (!id) return null;
  return DRAWER_HELP[id] ?? null;
}

/** Has a non-null entry in the registry. */
export function hasHelp(id: DrawerId | null | undefined): boolean {
  return !!getHelp(id);
}

/**
 * "You haven't opened help here yet" indicator — persisted to
 * localStorage so users don't see the pulse re-appear on every page
 * reload (just on truly-new drawers).
 *
 * Implementation:
 *  - Module-level cache lazily hydrated from localStorage on first
 *    client read.
 *  - Falls back to in-memory Set if storage is unavailable (Safari
 *    private mode, SSR, sandboxed iframes).
 *  - We only mark a drawer "seen" when the user actually clicks the
 *    ⓘ button — passive drawer opens don't count, since the help
 *    panel is what we're hinting at.
 *  - Storage key is versioned so we can invalidate later if entries
 *    materially change.
 */
const HELP_SEEN_STORAGE_KEY = "tulala-help-seen-v1";
let SEEN_CACHE: Set<DrawerId> | null = null;

function getSeenSet(): Set<DrawerId> {
  if (SEEN_CACHE) return SEEN_CACHE;
  if (typeof window === "undefined") {
    // SSR or non-browser context — return ephemeral set; will be
    // replaced on first client-side call.
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(HELP_SEEN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        SEEN_CACHE = new Set(parsed as DrawerId[]);
        return SEEN_CACHE;
      }
    }
  } catch {
    // Storage disabled or quota exceeded — fall through to fresh set.
  }
  SEEN_CACHE = new Set();
  return SEEN_CACHE;
}

function persistSeen(set: Set<DrawerId>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Best-effort. If storage write fails, the in-memory cache still
    // honors the user's actions for this session.
  }
}

export function hasOpenedHelp(id: DrawerId | null | undefined): boolean {
  if (!id) return false;
  return getSeenSet().has(id);
}

export function markHelpOpened(id: DrawerId | null | undefined): void {
  if (!id) return;
  const set = getSeenSet();
  if (set.has(id)) return;
  set.add(id);
  persistSeen(set);
}

/**
 * Test/dev escape hatch — wipe the "seen help" memory so the indicator
 * re-pulses for QA. Exposed for future settings → "reset onboarding"
 * menu, and as a console helper during prototyping.
 */
export function resetSeenHelp(): void {
  SEEN_CACHE = new Set();
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(HELP_SEEN_STORAGE_KEY); } catch {}
  }
}

// ─── Help-content feedback (thumbs up / down) ─────────────────────
//
// Lightweight per-drawer feedback so we know which entries need
// rewriting. Persists locally for now; future hook will POST to an
// analytics endpoint so the docs/support team can prioritize.

export type HelpFeedback = "up" | "down";
const HELP_FEEDBACK_STORAGE_KEY = "tulala-help-feedback-v1";
let FEEDBACK_CACHE: Record<string, HelpFeedback> | null = null;

function getFeedbackMap(): Record<string, HelpFeedback> {
  if (FEEDBACK_CACHE) return FEEDBACK_CACHE;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HELP_FEEDBACK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        FEEDBACK_CACHE = parsed as Record<string, HelpFeedback>;
        return FEEDBACK_CACHE;
      }
    }
  } catch {}
  FEEDBACK_CACHE = {};
  return FEEDBACK_CACHE;
}

export function getHelpFeedback(id: DrawerId | null | undefined): HelpFeedback | null {
  if (!id) return null;
  return getFeedbackMap()[id] ?? null;
}

export function setHelpFeedback(id: DrawerId, value: HelpFeedback): void {
  const map = getFeedbackMap();
  map[id] = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HELP_FEEDBACK_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }
  // Future hook: POST {drawerId, value} to /api/help-feedback
}

/** Format a DrawerId into a human label. Mirrors drawerIdToLabel
 * in _primitives.tsx so chips read consistently. */
export function drawerLabel(id: DrawerId): string {
  return id
    .split("-")
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// ─── Help panel UI ───────────────────────────────────────────────────

/**
 * The slide-down help panel rendered inside DrawerShell when the user
 * toggles the ⓘ button. Keeps a stable layout (no jumpy reflow) by
 * always rendering and toggling height + opacity.
 */
export function HelpPanel({
  drawerId,
  open,
  onJumpTo,
  panelId,
}: {
  drawerId: DrawerId | null;
  open: boolean;
  onJumpTo: (id: DrawerId) => void;
  /** DOM id used by the toolbar ⓘ button's aria-controls. */
  panelId: string;
}) {
  const t = useT();
  const entry = getHelp(drawerId);

  // Mount/unmount nicely — keep panel in DOM during open=true so the
  // collapse transition can run, then unmount when fully closed.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    else {
      const t = window.setTimeout(() => setMounted(false), 240);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!mounted || !entry) return null;

  const audiences = (Array.isArray(entry.audience) ? entry.audience : [entry.audience]).filter(Boolean);
  // Defensive: every entry should have ≥1 audience, but if a future
  // entry slips in with [], fall back to a workspace tint.
  const audienceColor = audiences.length > 0 ? audienceTint(audiences[0]!) : audienceTint("Workspace admin");

  // Catalog root for this entry's own copy (purpose + bullets).
  const topicBase = `${HELP_NS}.topics.${drawerId ?? ""}`;

  // Honor prefers-reduced-motion: snap-toggle the panel instead of
  // animating, and disable the pulse keyframe (handled in the icon
  // button via a media query inside its <style>).
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      id={panelId}
      // `inert` removes the panel from focus order AND the a11y tree
      // when collapsed — stronger than aria-hidden alone. Some
      // browsers still let focus land on aria-hidden elements; inert
      // is the proper fix. (`@ts-ignore` not needed — React 19 types
      // include it.)
      inert={!open ? true : undefined}
      role="region"
      aria-label={tOr(t, `${HELP_NS}.ui.aboutThisView`, "About this view")}
      aria-hidden={!open}
      data-tulala-drawer-help-panel="true"
      style={{
        // Grid-rows trick: animates between 0fr (collapsed) and 1fr
        // (auto-content-height) smoothly. Max-height fixed to 1200
        // would run past the actual content in 260ms regardless of
        // size — this animates against the real height every time.
        // Supported: Chrome 117+, Safari 16+, Firefox 119+.
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: prefersReducedMotion
          ? "none"
          : "grid-template-rows 260ms cubic-bezier(.4,0,.2,1), opacity 200ms ease, border-color 200ms ease",
        borderTop: `1px solid ${open ? COLORS.borderSoft : "transparent"}`,
        borderBottom: `1px solid ${open ? COLORS.borderSoft : "transparent"}`,
        background: "linear-gradient(180deg, rgba(244,239,231,0.55) 0%, rgba(244,239,231,0.25) 100%)",
      }}
    >
      <div
        style={{
          // The grid child needs minHeight:0 + overflow:hidden so the
          // 0fr→1fr transition doesn't leak content during collapse.
          minHeight: 0,
          overflow: "hidden",
          // Horizontal 22px matches DrawerShell's body padding so the
          // help text aligns with the form fields below it.
          padding: "16px 22px 18px",
          fontFamily: FONTS.body,
        }}
      >
        {/* Eyebrow row — audience + category */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          {audiences.map((a) => (
            <span
              key={a}
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 999,
                background: audienceTint(a).bg,
                color: audienceTint(a).fg,
              }}
            >
              {tOr(t, `${HELP_NS}.audiences.${catalogSlug(a)}`, a)}
            </span>
          ))}
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.3 }} className="text-admin-ink-muted">
            · {tOr(t, `${HELP_NS}.categories.${catalogSlug(entry.category)}`, entry.category)}
          </span>
        </div>

        {/* Purpose */}
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, fontWeight: 450 }} className="text-admin-ink">
          {tOr(t, `${topicBase}.purpose`, entry.purpose)}
        </p>

        {/* What you can do here — gated on at least one bullet so a
            terse entry doesn't render an empty heading. */}
        {entry.youCanHere.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
            {tOr(t, `${HELP_NS}.ui.youCanHere`, "What you can do here")}
          </h4>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {entry.youCanHere.map((line, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: COLORS.ink,
                  paddingLeft: 16,
                  position: "relative",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 4,
                    top: 9,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: audienceColor.fg,
                  }}
                />
                {tOr(t, `${topicBase}.b${i}`, line)}
              </li>
            ))}
          </ul>
        </div>
        )}

        {/* Related drawers */}
        {entry.relatedDrawers && entry.relatedDrawers.length > 0 && (
          <div className="mt-4">
            <h4 style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
              {tOr(t, `${HELP_NS}.ui.relatedViews`, "Related views")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {entry.relatedDrawers.map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => onJumpTo(rel)}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1px solid ${COLORS.borderSoft}`,
                    background: "#fff",
                    color: COLORS.ink,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    transition: "border-color .12s, background .12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border;
                    e.currentTarget.style.background = "rgba(11,11,13,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.borderSoft;
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  {tOr(t, `${HELP_NS}.drawerLabels.${rel}`, drawerLabel(rel))}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Was-this-helpful — collects per-drawer feedback so the docs
            team knows which entries need rewriting. Persisted locally;
            future hook POSTs to analytics. */}
        <FeedbackRow drawerId={drawerId} />

        {/* Footer — support / chat / ticket entry points (placeholders
            for future wiring; rendered now so the layout is stable
            once those features land). */}
        <FooterActions entry={entry} drawerId={drawerId} />
      </div>
    </div>
  );
}

// "Was this helpful?" row. Quietly collects feedback per drawer so we
// can prioritize content rewrites. Once the user votes, the row
// switches to a thank-you state with an "Undo" link in case of
// fat-finger.
function FeedbackRow({ drawerId }: { drawerId: DrawerId | null }) {
  const proto = useAdminShell();
  const t = useT();
  const [vote, setVote] = useState<HelpFeedback | null>(() =>
    getHelpFeedback(drawerId),
  );
  // Re-sync when the drawer changes (panel can stay mounted across
  // related-drawer jumps).
  useEffect(() => {
    setVote(getHelpFeedback(drawerId));
  }, [drawerId]);

  if (!drawerId) return null;

  const submit = (v: HelpFeedback) => {
    // Guard against rapid double-click: if a vote already exists,
    // ignore further clicks until Undo is pressed. Prevents the toast
    // queue from filling up if the button is mashed.
    if (vote) return;
    setHelpFeedback(drawerId, v);
    setVote(v);
    proto.toast(
      v === "up"
        ? tOr(t, `${HELP_NS}.ui.toastThanksUp`, "Thanks, glad this helped.")
        : tOr(t, `${HELP_NS}.ui.toastThanksDown`, "Thanks, we'll improve this view."),
      {
        action: {
          label: tOr(t, "public.guestChat.removedToastUndo", "Undo"),
          onClick: () => {
            // Clear the entry so the row re-prompts.
            const map = getFeedbackMap();
            delete map[drawerId];
            if (typeof window !== "undefined") {
              try {
                window.localStorage.setItem(
                  HELP_FEEDBACK_STORAGE_KEY,
                  JSON.stringify(map),
                );
              } catch {}
            }
            setVote(null);
          },
        },
      },
    );
  };

  const sharedBtn = {
    background: "transparent",
    border: `1px solid ${COLORS.borderSoft}`,
    width: 28,
    height: 24,
    borderRadius: 6,
    cursor: "pointer",
    color: COLORS.inkMuted,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background .12s, color .12s, border-color .12s",
    fontFamily: FONTS.body,
  } as const;

  if (vote) {
    return (
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${COLORS.borderSoft}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
        <span aria-hidden className="text-admin-13">
          {vote === "up" ? "✓" : "✦"}
        </span>
        <span>
          {vote === "up"
            ? tOr(t, `${HELP_NS}.ui.feedbackSavedUp`, "Thanks, feedback saved.")
            : tOr(t, `${HELP_NS}.ui.feedbackSavedDown`, "Thanks, we'll revisit this view's help.")}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${COLORS.borderSoft}`, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
      <span>{tOr(t, `${HELP_NS}.ui.wasThisHelpful`, "Was this helpful?")}</span>
      <div className="inline-flex gap-1.5">
        <button
          type="button"
          aria-label={tOr(t, `${HELP_NS}.ui.voteUpAria`, "Yes, this was helpful")}
          onClick={() => submit("up")}
          style={sharedBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.brand;
            e.currentTarget.style.background = COLORS.brandSoft;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.borderSoft;
            e.currentTarget.style.color = COLORS.inkMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
            <path d="M7 11l4-7a2 2 0 0 1 4 0v5h5a2 2 0 0 1 2 2.3l-1.5 7A2 2 0 0 1 18.5 20H7" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={tOr(t, `${HELP_NS}.ui.voteDownAria`, "No, this could be better")}
          onClick={() => submit("down")}
          style={sharedBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.coral;
            e.currentTarget.style.background = COLORS.coralSoft;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.borderSoft;
            e.currentTarget.style.color = COLORS.inkMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" />
            <path d="M17 13l-4 7a2 2 0 0 1-4 0v-5H4a2 2 0 0 1-2-2.3L3.5 5.7A2 2 0 0 1 5.5 4H17" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Small renderer for the footer support links. Split for readability.
function FooterActions({
  entry,
  drawerId,
}: {
  entry: HelpEntry;
  drawerId: DrawerId | null;
}) {
  const proto = useAdminShell();
  const t = useT();
  if (!drawerId) return null;
  const slug = entry.supportSlug ?? drawerId;
  const openHelpDrawerLabel = tOr(t, `${HELP_NS}.ui.openHelpDrawer`, "Open help drawer");

  const linkBtnStyle = {
    background: "transparent",
    border: "none",
    padding: 0,
    color: COLORS.inkMuted,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: FONTS.body,
    textAlign: "left" as const,
  };

  return (
    <div style={{ marginTop: 12, // No divider here — FeedbackRow above already drew a dashed
        // line for this whole "drawer-meta" footer block. Stacking
        // two horizontal rules created visual noise.
        display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, alignItems: "center" }} className="text-admin-ink-muted">
      <button
        type="button"
        onClick={() =>
          proto.toast(
            interpolate(
              tOr(
                t,
                `${HELP_NS}.ui.toastSupportArticle`,
                'Support article "/support/{slug}" is coming soon.',
              ),
              { slug },
            ),
          )
        }
        style={linkBtnStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
      >
        {/* No ↗ until the actual /support/<slug> route exists. The
            arrow on a button that just toasts felt like a 404 every
            time you clicked it. Add ↗ back when wired live. */}
        {tOr(t, `${HELP_NS}.ui.fullGuide`, "Full guide")}
        <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 10.5 }}>
          {tOr(t, `${HELP_NS}.ui.soon`, "(soon)")}
        </span>
      </button>
      <Fragment>
        <span aria-hidden style={{ opacity: 0.4 }}>·</span>
        <button
          type="button"
          onClick={() =>
            proto.toast(
              interpolate(
                tOr(
                  t,
                  `${HELP_NS}.ui.toastChatSupport`,
                  'Chat with support is coming soon. We\'ll pre-load context for "{drawer}".',
                ),
                { drawer: drawerId },
              ),
              {
                action: {
                  label: openHelpDrawerLabel,
                  onClick: () => proto.openDrawer("help"),
                },
              },
            )
          }
          style={linkBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
        >
          {tOr(t, "dashboard.clientOffer.askQuestion", "Ask a question")}
        </button>
      </Fragment>
      {entry.ticketCategory && (
        <Fragment>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <button
            type="button"
            onClick={() =>
              proto.toast(
                interpolate(
                  tOr(
                    t,
                    `${HELP_NS}.ui.toastTicketForm`,
                    'Ticket form is coming soon. We\'ll pre-fill category "{category}".',
                  ),
                  {
                    category: tOr(
                      t,
                      `${HELP_NS}.ticketCategories.${catalogSlug(entry.ticketCategory!)}`,
                      entry.ticketCategory!,
                    ),
                  },
                ),
                {
                  action: {
                    label: openHelpDrawerLabel,
                    onClick: () => proto.openDrawer("help"),
                  },
                },
              )
            }
            style={linkBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            {tOr(t, `${HELP_NS}.ui.submitATicket`, "Submit a ticket")}
          </button>
        </Fragment>
      )}
    </div>
  );
}

// Audience → tint. Pulls from the project's semantic color tokens
// (see _state.tsx COLORS) so we stay aligned with the rest of the
// design system. Per feedback_admin_aesthetics.md, gold/rust earth-
// tones are explicitly avoided.
//
//   Workspace  → neutral ink (no hue — the "default" surface)
//   Talent     → brand forest (talent IS the product surface)
//   Client     → indigo (informational/external)
//   Tulala HQ  → critical (internal-only / elevated permissions)
function audienceTint(a: Audience): { bg: string; fg: string } {
  switch (a) {
    case "Workspace admin":
    case "Workspace coordinator":
    case "Workspace editor":
      return { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink };
    case "Talent":
      return { bg: COLORS.brandSoft, fg: COLORS.brandDeep };
    case "Client":
      return { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep };
    case "Tulala HQ":
      return { bg: COLORS.criticalSoft, fg: COLORS.criticalDeep };
    default:
      return { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink };
  }
}
