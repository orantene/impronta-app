"use client";

import { useState, type CSSProperties } from "react";
import { Avatar, CapsLabel, ClientTrustBadge, Icon, Toggle } from "../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell } from "../../state";
import { type InboxFilter, type InboxItem } from "./client-threads-1";
import { KindChip } from "./today-1";



/**
 * E1: AI reply assistant — high-fidelity prototype. Surfaces 3 hardcoded
 * reply variants for the top pending action item. The talent picks a
 * variant, optionally edits, and sends.
 *
 * In production: calls an LLM with the inquiry thread context. Privacy:
 * opt-in toggle in Settings (per the agency-exclusivity spec). Client
 * names anonymized in the prompt by default. See backend handoff §8.1.
 */
export function AIReplyAssistant({ item }: { item: InboxItem | null }) {
  const { toast } = useAdminShell();
  const [expanded, setExpanded] = useState(false);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  if (!item) return null;

  // Hardcoded variants per kind. Production: LLM-generated.
  const variants: { label: string; body: string }[] = [
    {
      label: "Quick confirm",
      body: `Hi — confirmed for ${item.date ?? "the date listed"}. ${item.amount ? `${item.amount} works on my end.` : ""} Bringing the standard kit. Anything specific from the brief I should plan for?`,
    },
    {
      label: "Polite hold",
      body: `Hi — interested but I need to check one conflict. Can I confirm by end of day tomorrow? If you need an answer sooner, please let me know.`,
    },
    {
      label: "Decline with grace",
      body: `Thanks for thinking of me. I won't be able to take this one — already committed for ${item.date ?? "around then"}. Would love to be in mind for the next campaign.`,
    },
  ];

  return (
    <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid rgba(95,75,139,0.18)`, borderRadius: 12, fontFamily: FONTS.body }} className="bg-admin-royal-soft">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(95,75,139,0.18)",
            color: COLORS.royalDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={13} stroke={1.7} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-admin-royal-deep text-admin-13 font-semibold">
            AI suggestion for {item.client}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.78, marginTop: 1 }} className="text-admin-royal-deep">
            {expanded
              ? "Pick a variant, then open the thread to reply."
              : "3 reply variants ready. Click to preview."}
          </div>
        </div>
        <Icon
          name="chevron-down"
          size={12}
          stroke={2}
          color={COLORS.royalDeep}
        />
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {variants.map((v, i) => {
            const active = pickedIdx === i;
            return (
              <button
                key={v.label}
                type="button"
                onClick={() => setPickedIdx(active ? null : i)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  background: active ? "#fff" : "rgba(255,255,255,0.65)",
                  border: `1px solid ${active ? COLORS.royal : "rgba(95,75,139,0.18)"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div className="text-admin-royal-deep text-admin-11 font-bold">
                  {v.label}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
                  {v.body}
                </div>
              </button>
            );
          })}
          {pickedIdx !== null && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setPickedIdx(null);
                  setExpanded(false);
                  item.onOpen();
                }}
                style={{
                  background: COLORS.fill,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Open thread →
              </button>
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 10.5, fontFamily: FONTS.body }} className="text-admin-ink-dim">
            Privacy: client name is anonymized when we generate suggestions. Toggle off in Settings → Notifications.
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Audit #24 + #26 — saved views + smart-sort toolbar. Premium triage
 * controls: predefined saved views (default / verified clients only /
 * holds expiring / from agencies) and a sort axis selector
 * (urgency / newest / value / fit). All persist for the session.
 */
export function InboxPowerToolbar({
  savedView,
  onSavedViewChange,
  sortAxis,
  onSortChange,
  totalShown,
}: {
  savedView: string;
  onSavedViewChange: (v: string) => void;
  sortAxis: "urgency" | "newest" | "value" | "fit";
  onSortChange: (s: "urgency" | "newest" | "value" | "fit") => void;
  totalShown: number;
}) {
  const views = [
    { id: "default", label: "All inbox" },
    { id: "verified", label: "Verified+ clients only" },
    { id: "expiring", label: "Holds expiring" },
    { id: "agency", label: "From agencies" },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 10,
        padding: "8px 0",
        fontFamily: FONTS.body,
        flexWrap: "wrap",
      }}
    >
      <CapsLabel>View</CapsLabel>
      <select
        value={savedView}
        onChange={(e) => onSavedViewChange(e.target.value)}
        style={inboxToolbarSelectStyle}
      >
        {views.map((v) => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>
      <span style={{ color: COLORS.borderSoft }}>|</span>
      <CapsLabel>Sort</CapsLabel>
      <select
        value={sortAxis}
        onChange={(e) => onSortChange(e.target.value as "urgency" | "newest" | "value" | "fit")}
        style={inboxToolbarSelectStyle}
      >
        <option value="urgency">Urgency</option>
        <option value="newest">Newest</option>
        <option value="value">Highest value</option>
        <option value="fit">Best fit (AI)</option>
      </select>
      <div style={{ flex: 1 }} />
      <span className="text-admin-ink-muted text-admin-11h">
        {totalShown} item{totalShown === 1 ? "" : "s"}
      </span>
    </div>
  );
}


const inboxToolbarSelectStyle: CSSProperties = {
  padding: "5px 10px",
  fontFamily: FONTS.body,
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.ink,
  background: "#fff",
  border: `1px solid ${COLORS.borderSoft}`,
  borderRadius: 7,
  cursor: "pointer",
};


/**
 * Audit #23 — bulk action bar. Renders inline above the list when one
 * or more rows are selected. Bulk mutation is not wired yet, so this
 * only exposes selection count and clearing.
 */
export function BulkActionBar({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", color: "#fff", borderRadius: 10, fontFamily: FONTS.body, marginTop: 12 }} className="bg-admin-fill">
      <span className="text-admin-13 font-semibold">
        {count} selected
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.74)" }}>
        Bulk actions coming soon
      </span>
      <button
        onClick={onClear}
        aria-label="Clear selection"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          padding: "4px 6px",
          fontSize: 14,
        }}
      >
        ✕
      </button>
    </div>
  );
}


export function InboxFilterChips({
  filter,
  onChange,
  counts,
}: {
  filter: InboxFilter;
  onChange: (f: InboxFilter) => void;
  counts: Record<InboxFilter, number>;
}) {
  const chips: { key: InboxFilter; label: string; tone: string }[] = [
    { key: "action", label: "Action", tone: COLORS.coral },
    { key: "active", label: "Active", tone: COLORS.indigo },
    { key: "confirmed", label: "Confirmed", tone: COLORS.green },
    { key: "closed", label: "Closed", tone: COLORS.inkDim },
    { key: "all", label: "All", tone: COLORS.ink },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {chips.map((c) => {
        const active = filter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              borderRadius: 999,
              background: active ? COLORS.fill : "#fff",
              border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              color: active ? "#fff" : COLORS.ink,
              transition: `background ${TRANSITION.micro}`,
            }}
          >
            {!active && (
              <span
                aria-hidden
                style={{ width: 6, height: 6, borderRadius: "50%", background: c.tone }}
              />
            )}
            <span>{c.label}</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: active ? "rgba(255,255,255,0.6)" : COLORS.inkDim,
                fontSize: 11.5,
              }}
            >
              {counts[c.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}


/** Unified inbox row — same anatomy as Today's Needs-reply rows. */
export function InboxRow({
  item,
  first,
  checked,
  onToggleCheck,
  onTemplate,
}: {
  item: InboxItem;
  first: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  onTemplate?: () => void;
}) {
  const [hover, setHover] = useState(false);
  // Coral-escalated timestamp for stale action items
  const ageColor =
    item.category === "action" && item.ageHrs >= 24
      ? COLORS.coral
      : item.category === "action" && item.ageHrs >= 12
        ? COLORS.coral
        : COLORS.inkDim;
  const ageWeight = item.category === "action" && item.ageHrs >= 24 ? 600 : 400;
  const ageLabel =
    item.ageHrs < 24 ? `${item.ageHrs}h ago` : `${Math.floor(item.ageHrs / 24)}d ago`;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 0",
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: checked ? "rgba(15,79,62,0.04)" : "transparent",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
    >
      {/* Audit #23 — bulk-select checkbox. Visible on hover, on checked
          state, or when other rows are checked (the parent controls). */}
      {onToggleCheck && (
        <label
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            cursor: "pointer",
            opacity: checked || hover ? 1 : 0.4,
            transition: `opacity ${TRANSITION.micro}`,
            flexShrink: 0,
            paddingLeft: 2,
          }}
        >
          <input
            type="checkbox"
            checked={!!checked}
            onChange={onToggleCheck}
            style={{
              width: 16,
              height: 16,
              cursor: "pointer",
              accentColor: COLORS.accent,
            }}
          />
        </label>
      )}
      <button
        type="button"
        onClick={item.onOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
          padding: 0,
          minWidth: 0,
        }}
      >
      <div className="relative shrink-0">
        <Avatar
          size={36}
          tone="auto"
          hashSeed={item.client}
          initials={inboxClientInitials(item.client)}
        />
        <ClientTrustBadge level={item.clientTrust} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
          <span>{item.client}</span>
          <span className="text-admin-ink-dim">·</span>
          <span style={{ fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} className="text-admin-ink-muted">
            {item.brief}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          <KindChip label={item.kindLabel} tone={item.kindTone} />
          <span className="text-admin-ink-muted">
            {item.microcopy}
            {item.date && ` · ${item.date}`}
            {item.amount && ` · ${item.amount}`}
          </span>
        </div>
      </div>
      {item.category === "action" && hover && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600 }} className="bg-admin-coral-soft text-admin-coral-deep">
          Reply →
        </span>
      )}
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: ageColor,
          fontWeight: ageWeight,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {ageLabel}
      </span>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
      </button>
      {/* Audit #25 + #53 — hover-only saved replies. Click on this
          doesn't propagate to the row's open handler. Always reserve
          space (visibility:hidden when not hovering) so the row width
          doesn't jump. */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          visibility: hover ? "visible" : "hidden",
        }}
      >
        {onTemplate && item.category === "action" && (
          <button
            onClick={(e) => { e.stopPropagation(); onTemplate(); }}
            aria-label="Open saved replies"
            title="Open saved replies"
            style={inboxHoverIconStyle}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}


const inboxHoverIconStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: `1px solid ${COLORS.borderSoft}`,
  background: "#fff",
  color: COLORS.inkMuted,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};


function inboxClientInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}
