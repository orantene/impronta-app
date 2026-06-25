"use client";

/**
 * InquiryDetailsRail — the collapsible vertical details sidebar for the Message
 * Impronta chat (plan ADDENDUM 2026-06-25 / A). This is the canonical "form
 * view"; it SUPERSEDES the slide-up AllDetailsSheet (§4.B.5) and the §7 two-pane.
 *
 * A vertical list of inquiry-section rows — Type, Budget, Headcount, Date,
 * Location, Talent, Brief, Contact — each rendered by InquiryDetailRow with a
 * leading lucide icon, a label, and a filled-state check. Filled-state derives
 * from the live useUnifiedInquiry draft (the `intent` prop), so it stays in sync
 * with edits made anywhere (chips, guided cards, remote admin/talent edits).
 *
 * Collapse / expand:
 *   • COLLAPSED  = a thin icon-only rail (icons + a filled dot, no labels).
 *   • EXPANDED   = icons + labels + the filled checks.
 *   A header toggle (PanelLeftClose / PanelLeftOpen) switches the two. The state
 *   persists in sessionStorage so it survives panel close/reopen in one session.
 *
 * Clicking a row opens that section's editor inline below the row (one-open-at-a-
 * time). The editors are the EXISTING reusable components:
 *   • Type / Budget / Headcount / Date / Location → GuestDetailChipEditor
 *   • Talent  → TalentPickerEditor
 *   • Brief   → BriefEditor
 *   • Contact → ContactEditor
 * Every commit routes through the SAME handlers the chips use today
 * (onPatchChip / onTalentChange / onBriefChange / onContactChange), i.e. through
 * useUnifiedInquiry.patch, so each edit autosaves to the one inquiry record and
 * drops a synced thread note. There is NO second source of truth.
 *
 * Files: there is no wired Files editor on the unified patch path (no `files`
 * patch kind, FilesLinksSection is not plumbed here), so per the house rule
 * "no dead CTAs" the Files row is intentionally HIDDEN rather than shown inert.
 * When a Files editor lands, add it to SECTIONS and render its editor below.
 *
 * a11y: the toggle is a real <button> with aria-expanded; the rows are keyboard
 * accessible buttons (InquiryDetailRow). Reduced-motion: the only animation is a
 * short transform/opacity on the editor reveal which is disabled under
 * prefers-reduced-motion via the injected <style> block.
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes, "client"
 * never "buyer", real lucide icons (never placeholder boxes).
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  Calendar,
  FileText,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Tag,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type {
  GuestChipKind,
  GuestChipValue,
  ListGuestTenantRosterCallback,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

import { BriefEditor } from "./BriefEditor";
import { ContactEditor } from "./ContactEditor";
import { GuestDetailChipEditor } from "./GuestDetailChipEditor";
import { InquiryDetailRow } from "./InquiryDetailRow";
import { TalentPickerEditor } from "./TalentPickerEditor";
import { C, FONT, readableOn } from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Section model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every section the rail can show. `chip` sections reuse GuestDetailChipEditor
 * (keyed by GuestChipKind); the three composite sections have their own editor.
 * Order per owner: Type, Budget, Headcount, Date, Location, Talent, Brief,
 * Contact. (Files is omitted on purpose — see file header.)
 */
type RailSection =
  | { id: GuestChipKind; label: string; icon: LucideIcon; editor: "chip" }
  | { id: "talent"; label: string; icon: LucideIcon; editor: "talent" }
  | { id: "brief"; label: string; icon: LucideIcon; editor: "brief" }
  | { id: "contact"; label: string; icon: LucideIcon; editor: "contact" };

const SECTIONS: RailSection[] = [
  { id: "event_type", label: "Type", icon: Tag, editor: "chip" },
  { id: "budget", label: "Budget", icon: Wallet, editor: "chip" },
  { id: "headcount", label: "Headcount", icon: Users, editor: "chip" },
  { id: "date", label: "Date", icon: Calendar, editor: "chip" },
  { id: "location", label: "Location", icon: MapPin, editor: "chip" },
  { id: "talent", label: "Talent", icon: Sparkles, editor: "talent" },
  { id: "brief", label: "Brief", icon: FileText, editor: "brief" },
  { id: "contact", label: "Contact", icon: UserRound, editor: "contact" },
];

type SectionId = RailSection["id"];

const STORAGE_KEY = "impronta.inquiryRail.collapsed";

// ─────────────────────────────────────────────────────────────────────────────
// Filled-state — derived from the live unified draft (InquiryIntent).
// ─────────────────────────────────────────────────────────────────────────────

function isSectionFilled(id: SectionId, intent: InquiryIntent): boolean {
  switch (id) {
    case "event_type": {
      const v = intent.source_context?.["ai_event_type"];
      return typeof v === "string" && v.trim().length > 0;
    }
    case "budget": {
      const b = intent.budget;
      if (!b) return false;
      // "not_sure" is the neutral default and does not count as filled.
      return (
        (b.amount != null && b.amount > 0) ||
        (b.preference != null && b.preference !== "not_sure")
      );
    }
    case "headcount":
      return intent.talent?.count_needed != null && intent.talent.count_needed > 0;
    case "date":
      return Boolean(intent.date?.event_date) || Boolean(intent.date?.status);
    case "location":
      return Boolean(intent.location?.city?.trim()) || Boolean(intent.location?.status);
    case "talent":
      return (intent.talent?.selected_ids?.length ?? 0) > 0;
    case "brief":
      return Boolean(intent.brief?.summary?.trim());
    case "contact":
      return Boolean(intent.requester?.name?.trim()) || Boolean(intent.requester?.email?.trim());
    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type InquiryDetailsRailProps = {
  /** The live unified draft (drives filled-state). */
  intent: InquiryIntent;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable ink on accent (optional; derived when absent). */
  accentInk?: string;
  /** Tenant slug, forwarded to the talent picker's roster loader. */
  tenantSlug: string;
  /** Injected guest-safe roster loader for the talent picker (null hides search). */
  onListRoster?: ListGuestTenantRosterCallback | null;

  /**
   * Per-kind captured chip values, used to pre-fill GuestDetailChipEditor on
   * re-edit (Date/Location/Headcount/Type/Budget). Owned by the panel.
   */
  capturedValues?: Partial<Record<GuestChipKind, GuestChipValue>>;

  // Commit handlers — identical to the chip-row handlers (route via patch()).
  /** Commit a Date/Location/Headcount/Type/Budget edit. */
  onPatchChip: (kind: GuestChipKind, value: GuestChipValue) => void | Promise<void>;
  /** Commit a talent selection. */
  onTalentChange: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  /** Commit a brief edit. */
  onBriefChange: (summary: string) => void;
  /** Commit a contact edit. */
  onContactChange: (value: { name: string; email: string; phone: string }) => void;

  /**
   * Start collapsed. Defaults to true for the compact (single-column) panel so
   * the rail does not crowd the 380px width; pass false for the expanded pane.
   */
  defaultCollapsed?: boolean;
  /** Persist collapse state in sessionStorage. Defaults to true. */
  persist?: boolean;
  /**
   * Bound the section list + open editor in an internal vertical scroll so the
   * editor's Cancel/Confirm controls are always reachable inside the compact
   * (single-column) panel, where the pinned composer would otherwise occlude
   * them. Pass false in the expanded two-pane, which already has full height.
   * Defaults to true.
   */
  bounded?: boolean;
  /**
   * Phase 3 one-shot: expand the rail and open this section's editor. Used by the
   * launcher to deep-link the +N chip / a rail avatar to Talent, and to lead the
   * empty-cart panel with the talent-pick step. Cleared via onConsumeOpenTo.
   */
  openToSection?: SectionId | null;
  /** Clear the openToSection intent once it has been applied. */
  onConsumeOpenTo?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function InquiryDetailsRail({
  intent,
  accent,
  accentInk,
  tenantSlug,
  onListRoster = null,
  capturedValues = {},
  onPatchChip,
  onTalentChange,
  onBriefChange,
  onContactChange,
  defaultCollapsed = true,
  persist = true,
  bounded = true,
  openToSection = null,
  onConsumeOpenTo,
}: InquiryDetailsRailProps) {
  const ink = accentInk || readableOn(accent);
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  // One-open-at-a-time. Collapsing the rail closes any open editor.
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  // Polite save announcement (screen-reader feedback when a field commits).
  const [saveAnnounce, setSaveAnnounce] = useState("");
  const saveAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleId = useId();
  // Scroll container for the bounded section list; used to bring a freshly
  // opened editor into view so its Cancel/Confirm are never below the fold.
  const scrollRef = useRef<HTMLDivElement>(null);
  const openEditorRef = useRef<HTMLDivElement>(null);

  // Hydrate the persisted collapse state (sessionStorage, same session only).
  useEffect(() => {
    if (!persist || typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
      else if (raw === "0") setCollapsed(false);
    } catch {
      /* storage unavailable (private mode) — keep default */
    }
  }, [persist]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (next) setOpenSection(null); // collapsing hides any open editor
      if (persist && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }

  function toggleSection(id: SectionId) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  // Announce a field save to AT, then clear it so a repeat save of the SAME
  // field re-announces (a live region only fires on a content change).
  function announceSaved(label: string) {
    if (saveAnnounceTimerRef.current) clearTimeout(saveAnnounceTimerRef.current);
    setSaveAnnounce(`${label} saved.`);
    saveAnnounceTimerRef.current = setTimeout(() => setSaveAnnounce(""), 1200);
  }

  // Clear the announce timer on unmount.
  useEffect(() => {
    return () => {
      if (saveAnnounceTimerRef.current) clearTimeout(saveAnnounceTimerRef.current);
    };
  }, []);

  // Phase 3 deep-link / empty-state lead: when the launcher asks to open a
  // specific section, expand the rail and open that section's editor, then clear
  // the one-shot so a manual collapse afterwards sticks. Applied once per
  // distinct request value (a ref guards against the callback's per-render
  // identity re-triggering the effect, which would fight a manual collapse).
  const appliedOpenToRef = useRef<SectionId | null>(null);
  const onConsumeOpenToRef = useRef(onConsumeOpenTo);
  useEffect(() => {
    onConsumeOpenToRef.current = onConsumeOpenTo;
  }, [onConsumeOpenTo]);
  useEffect(() => {
    if (!openToSection) {
      appliedOpenToRef.current = null;
      return;
    }
    if (appliedOpenToRef.current === openToSection) return;
    appliedOpenToRef.current = openToSection;
    setCollapsed(false);
    setOpenSection(openToSection);
    onConsumeOpenToRef.current?.();
  }, [openToSection]);

  // When an editor opens, scroll it into view within the bounded scroll
  // container so its Cancel/Confirm controls clear the pinned composer.
  // Reduced-motion-safe: respect prefers-reduced-motion for the scroll behavior.
  useEffect(() => {
    if (!openSection || collapsed) return;
    const el = openEditorRef.current;
    if (!el) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      el.scrollIntoView({
        block: "nearest",
        behavior: prefersReduced ? "auto" : "smooth",
      });
    } catch {
      el.scrollIntoView();
    }
    // Move focus into the revealed editor so keyboard / SR users land on the
    // first control instead of hunting for it. The focus move is NOT gated on
    // prefers-reduced-motion (only the scroll behavior is).
    const first = el.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [openSection, collapsed]);

  const openSectionDef = openSection
    ? SECTIONS.find((s) => s.id === openSection) ?? null
    : null;

  // In the compact panel the rail (with an open editor) must not push the pinned
  // composer off-screen: cap the open-rail height to a share of the panel and let
  // its row list scroll. minHeight:0 lets this flex child actually shrink. The
  // collapsed icon-rail and the expanded two-pane are unaffected.
  const railBounded = bounded && !collapsed;

  return (
    <nav
      aria-label="Inquiry details"
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        width: collapsed ? 48 : "100%",
        minHeight: 0,
        maxHeight: railBounded ? "min(46vh, 320px)" : undefined,
        background: C.surfaceFaint,
        borderTop: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      {/* Reduced-motion-safe editor reveal animation. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            #${CSS.escape(styleId)} .uic-rail-editor {
              animation: uic-rail-reveal 160ms cubic-bezier(0.22,0.61,0.36,1) both;
            }
            #${CSS.escape(styleId)} [data-uic-detail-row]:focus-visible {
              outline: 2px solid ${accent};
              outline-offset: -2px;
            }
            @media (prefers-reduced-motion: reduce) {
              #${CSS.escape(styleId)} .uic-rail-editor { animation: none; }
            }
            @keyframes uic-rail-reveal {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `,
        }}
      />

      <div
        id={styleId}
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          flex: railBounded ? 1 : undefined,
        }}
      >
        {/* ── Header: title (expanded) + collapse/expand toggle ─────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            gap: 8,
            padding: collapsed ? "8px 0" : "8px 10px 8px 12px",
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          {!collapsed && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: C.inkMuted,
              }}
            >
              Inquiry details
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand inquiry details" : "Collapse inquiry details"}
            title={collapsed ? "Expand inquiry details" : "Collapse inquiry details"}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: C.inkMuted,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontFamily: FONT,
            }}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} strokeWidth={1.9} aria-hidden />
            ) : (
              <PanelLeftClose size={17} strokeWidth={1.9} aria-hidden />
            )}
          </button>
        </div>

        {/* ── Section rows ──────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            flexDirection: "column",
            paddingBottom: 4,
            // Bounded compact panel: scroll the list + open editor internally so
            // Cancel/Confirm always clear the pinned composer. minHeight:0 lets
            // this flex child shrink below its content height.
            ...(railBounded
              ? { flex: 1, minHeight: 0, overflowY: "auto" as const }
              : null),
          }}
        >
          {SECTIONS.map((section) => {
            const filled = isSectionFilled(section.id, intent);
            const isOpen = openSection === section.id;
            return (
              <div key={section.id}>
                <InquiryDetailRow
                  icon={section.icon}
                  label={section.label}
                  filled={filled}
                  open={isOpen}
                  collapsed={collapsed}
                  accent={accent}
                  accentInk={ink}
                  onToggle={() => toggleSection(section.id)}
                />

                {/* Inline editor (expanded rail only; one-open-at-a-time). */}
                {!collapsed && isOpen && openSectionDef && (
                  <div className="uic-rail-editor" ref={openEditorRef}>
                    {openSectionDef.editor === "chip" && (
                      <GuestDetailChipEditor
                        kind={openSectionDef.id as GuestChipKind}
                        initial={capturedValues[openSectionDef.id as GuestChipKind] ?? null}
                        accent={accent}
                        accentInk={ink}
                        onSubmit={(value) => {
                          void onPatchChip(openSectionDef.id as GuestChipKind, value);
                          announceSaved(openSectionDef.label);
                          setOpenSection(null);
                        }}
                        onCancel={() => setOpenSection(null)}
                      />
                    )}

                    {openSectionDef.editor === "talent" && (
                      <TalentPickerEditor
                        selectedIds={intent.talent?.selected_ids ?? []}
                        accent={accent}
                        tenantSlug={tenantSlug}
                        onListRoster={onListRoster}
                        onChange={(ids, mode, names) => {
                          onTalentChange(ids, mode, names);
                          announceSaved(openSectionDef.label);
                        }}
                      />
                    )}

                    {openSectionDef.editor === "brief" && (
                      <BriefEditor
                        initialSummary={intent.brief?.summary ?? null}
                        accent={accent}
                        accentInk={ink}
                        onSubmit={(summary) => {
                          onBriefChange(summary);
                          announceSaved(openSectionDef.label);
                          setOpenSection(null);
                        }}
                        onCancel={() => setOpenSection(null)}
                      />
                    )}

                    {openSectionDef.editor === "contact" && (
                      <ContactEditor
                        initial={{
                          name: intent.requester?.name ?? "",
                          email: intent.requester?.email ?? "",
                          phone: intent.requester?.phone ?? "",
                        }}
                        accent={accent}
                        accentInk={ink}
                        onSubmit={(value) => {
                          onContactChange(value);
                          announceSaved(openSectionDef.label);
                          setOpenSection(null);
                        }}
                        onCancel={() => setOpenSection(null)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Visually-hidden polite live region — announces field saves to AT. */}
      <span
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {saveAnnounce}
      </span>
    </nav>
  );
}
