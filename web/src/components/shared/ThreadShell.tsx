"use client";

// ThreadShell — Phase 2 shared messaging primitive (remediation plan §4).
//
// One shell, three role prop-interfaces. ~60% of the messaging surface is
// shareable (the inquiry list rail, selection model, message bubble column,
// detail/tab/right-rail composition); ~40% is irreducibly role-specific
// (status taxonomy, filter chips, role-only card types). The role-specific
// 40% is computed by each adopting surface and handed in as already-resolved
// view-model data (ThreadShellListItem / ThreadMessage) plus slots — this
// shell never imports a role's raw row type or status map. That separation
// is what keeps this a primitive instead of a fourth god-file.
//
// Strangler adoption order (plan §4): talent inbox (list-only, landed) →
// client → admin.
//
// ── Phase 2 slot extension (2026-05-19, plan §3) ────────────────────────
// The talent *inbox* was list-only and visually matched this shell's
// built-in chrome, so it adopted by projecting rows onto ThreadShellListItem
// and rendering the built-in ListRail. The client + admin Messages consoles
// are different: a `data-tulala-messages-shell` grid + bespoke mobile CSS,
// a list pane whose header owns search + filter chips, information-dense
// rows, and a bespoke tabbed thread pane. Their built-in-chrome output is
// NOT byte-identical to this shell's, so a built-in-render adoption would
// regress dense affordances (binding: simplify by redesign, never delete
// affordances).
//
// Resolution per plan §3 ("three role prop-interfaces backing one shell,
// NOT a god-component"): three OPTIONAL slots — `renderRow`,
// `listHeaderSlot`, `scaffold` — let an adopter keep its exact bespoke
// pixels while this shell owns only the shared orchestration: the list
// iteration, region composition, empty-state branching, and the
// message-column / composer core. All bespoke rendering stays in the
// role adapter and is injected through the slots; this file never gains
// a role's row markup. That separation is what keeps this a primitive.
//
// Back-compat is absolute: every new prop is optional and the new code
// path is reached ONLY when `scaffold` is supplied. With `scaffold` absent
// the two original return branches run byte-for-byte unchanged, so the
// landed talent-inbox adoption is provably untouched.
//
// NOT placed in primitives.tsx by design — that module is hard-siloed
// (56 internal-only imports, depends on useAdminShell). This primitive is
// dependency-free beyond next/link + react so any role surface can consume
// it without inheriting the admin-shell context.

import Link from "next/link";
import { Fragment, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export type ThreadRole = "admin" | "client" | "talent";

/** A resolved status/state chip. The adopting surface maps its own status
 *  taxonomy to these — this shell never interprets a raw status string. */
export interface ThreadBadge {
  label: string;
  bg: string;
  color: string;
  /** Native title tooltip (e.g. "Client found you via Discover"). */
  title?: string;
  uppercase?: boolean;
  /** Defaults to 10.5 (status-pill metric). Secondary chips pass 10. */
  fontSize?: number;
  /** Defaults to "2px 8px" (status-pill metric). State chips pass "1px 7px". */
  padding?: string;
}

/** Normalized inquiry list-row. Role adapters project their raw row
 *  (TalentInquiryRow, admin inquiry, client project, …) onto this. */
export interface ThreadShellListItem {
  id: string;
  /** Primary line — e.g. contact name. */
  title: string;
  /** Muted inline suffix after the title — e.g. "· Acme Co". */
  titleSuffix?: string;
  /** Secondary line — e.g. "Tulum · 14 Jun 2026". */
  meta?: string;
  /** Pre-formatted age label shown top-right — e.g. "3h ago". */
  timestamp?: string;
  /** Status pill + state chips, already resolved to colors. */
  badges?: ThreadBadge[];
  /** Leading status-dot color. */
  accentColor?: string;
  /** Unread / needs-action row tint. */
  highlighted?: boolean;
  /** When set, the row CTA is a prefetched <Link> to this href. */
  href?: string;
  /** Right-column CTA label — e.g. "Open thread". Defaults to "Open". */
  ctaLabel?: string;
}

/** A single message in the thread column (client/admin adoption). */
export interface ThreadMessage {
  id: string;
  authorLabel?: string;
  body: string;
  timestamp?: string;
  /** True = this role's own outbound message (right-aligned). */
  outbound?: boolean;
}

/** Interaction surface. All optional — list-only surfaces pass `{}`. */
export interface ThreadShellActions {
  onSelectInquiry?: (id: string) => void;
  onCompose?: (text: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onEditMessage?: (messageId: string) => void;
}

/** Per-row context handed to a role's `renderRow`. The adapter renders
 *  its own bespoke row; the shell only owns selection identity + position
 *  so the adapter never re-derives "am I active / last / how do I select". */
export interface ThreadShellRowContext {
  /** This row is the selected one (activeId === item.id). */
  active: boolean;
  /** Last row in the current (already filtered) list — for border/spacing. */
  isLast: boolean;
  /** Zero-based index in the filtered list. */
  index: number;
  /** Fire the shell's onSelectInquiry for this row. */
  select: () => void;
}

/** The three composed regions the shell hands to a role `scaffold`. The
 *  adapter owns the outer two-pane markup (grid + mobile CSS + panes) and
 *  drops these in — so pixels stay byte-identical while the shell owns the
 *  list iteration + region composition that is duplicated across consoles. */
export interface ThreadShellScaffoldRegions {
  /** Role list-pane header (search + filter chips). `listHeaderSlot`. */
  listHeader: ReactNode;
  /** Iterated rows (via `renderRow`, else built-in ListRow), or the
   *  empty-list node when there are no inquiries. */
  list: ReactNode;
  /** Role thread/detail region: tabsSlot → details → optional built-in
   *  MessageColumn → optional Composer → secondaryThreadSlot, composed in
   *  the same order as the built-in thread surface. */
  thread: ReactNode;
}

export interface ThreadShellProps {
  /** Normalized list rows (already filtered + sorted by the adapter). */
  inquiries: ThreadShellListItem[];
  /** Selected row id, or null for a list-only surface (talent inbox). */
  activeId: string | null;
  /** Thread messages for the active inquiry. Omit → no thread column. */
  messages?: ThreadMessage[];
  /** Role-specific detail pane (Details/Offer/Event). Omit → not rendered. */
  details?: ReactNode;
  role: ThreadRole;
  canCompose?: boolean;
  canReact?: boolean;
  canReply?: boolean;
  canEditMessage?: boolean;
  actions: ThreadShellActions;
  /** Admin coordinator workflow column. */
  rightRailSlot?: ReactNode;
  /** Detail-pane tab strip (client DetailsTab/OfferTab, admin POV tabs). */
  tabsSlot?: ReactNode;
  /** Admin secondary (coordinator/talent-coord) threads. */
  secondaryThreadSlot?: ReactNode;

  // ── Phase 2 optional slots (plan §3). All optional; the original
  //    list-only / thread return paths are byte-identical when `scaffold`
  //    is absent. Bespoke markup lives in the role adapter, never here. ──

  /** Role-specific row renderer. Omit → built-in ListRow (talent inbox /
   *  default). When supplied, the shell calls this per item and only owns
   *  selection identity + position (see ThreadShellRowContext). Active in
   *  the `scaffold` path and in the built-in ListRail. */
  renderRow?: (item: ThreadShellListItem, ctx: ThreadShellRowContext) => ReactNode;
  /** Role list-pane header (search + filter chips). Composed into the
   *  scaffold's `listHeader` region. */
  listHeaderSlot?: ReactNode;
  /** Node shown when `inquiries` is empty. Omit → built-in empty card.
   *  Lets a role keep its bespoke "no inquiries yet" CTA. */
  emptyListSlot?: ReactNode;
  /** Role-owned outer scaffold (the `data-tulala-messages-shell` grid +
   *  mobile CSS + the two panes). Receives the shell-composed regions and
   *  returns the full two-pane markup. Omit → built-in card/flex layout
   *  (talent inbox / default, unchanged). Supplying this is the strangler
   *  seam: the shell owns the duplicated list-iteration + region
   *  composition once; the adapter supplies its exact wrapper + rows +
   *  thread so not a pixel changes. */
  scaffold?: (regions: ThreadShellScaffoldRegions) => ReactNode;
}

// ── Shared chrome palette ───────────────────────────────────────────────
// Neutral surface tokens only. Per-row status colors arrive via the item
// (accentColor / badge.bg / badge.color) so the shell stays taxonomy-free.
// Values are byte-identical to the talent inbox's prior inline palette so
// the first adoption is pixel-stable.
const SURFACE = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  highlightRow: "rgba(15,79,62,0.025)",
  emptyBg: "rgba(11,11,13,0.02)",
  ctaColor: "#1D4ED8",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function ListRow({
  item,
  active,
  onSelect,
  isLast,
}: {
  item: ThreadShellListItem;
  active: boolean;
  onSelect?: (id: string) => void;
  isLast: boolean;
}) {
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: 12,
    alignItems: "center",
    padding: "13px 16px",
    borderBottom: isLast ? "none" : `1px solid ${SURFACE.borderSoft}`,
    fontFamily: FONT,
    background: active
      ? SURFACE.highlightRow
      : item.highlighted
        ? SURFACE.highlightRow
        : "transparent",
  };

  const cta = item.href ? (
    <Link
      href={item.href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        padding: "0 10px",
        borderRadius: 8,
        border: `1px solid ${SURFACE.borderSoft}`,
        color: SURFACE.ctaColor,
        fontSize: 11.5,
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {item.ctaLabel ?? "Open"}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => onSelect?.(item.id)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        padding: "0 10px",
        borderRadius: 8,
        border: `1px solid ${SURFACE.borderSoft}`,
        background: "transparent",
        cursor: "pointer",
        color: SURFACE.ctaColor,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        fontFamily: FONT,
      }}
    >
      {item.ctaLabel ?? "Open"}
    </button>
  );

  return (
    <div style={rowStyle}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: item.accentColor ?? SURFACE.inkDim,
          flexShrink: 0,
        }}
      />

      <div className="min-w-0">
        {item.badges && item.badges.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 3,
              flexWrap: "wrap",
            }}
          >
            {item.badges.map((b, i) => (
              <span
                key={`${item.id}-badge-${i}`}
                title={b.title}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: b.padding ?? "2px 8px",
                  borderRadius: 999,
                  background: b.bg,
                  color: b.color,
                  fontSize: b.fontSize ?? 10.5,
                  fontWeight: 700,
                  letterSpacing: b.uppercase ? 0.3 : undefined,
                  textTransform: b.uppercase ? "uppercase" : undefined,
                  whiteSpace: "nowrap",
                }}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: SURFACE.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
          {item.titleSuffix && (
            <span
              style={{
                color: SURFACE.inkMuted,
                fontWeight: 400,
                marginLeft: 6,
              }}
            >
              {item.titleSuffix}
            </span>
          )}
        </div>
        {item.meta && (
          <div style={{ fontSize: 11.5, color: SURFACE.inkMuted, marginTop: 2 }}>
            {item.meta}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 7,
        }}
      >
        {item.timestamp && (
          <span
            style={{
              fontSize: 11,
              color: SURFACE.inkDim,
              whiteSpace: "nowrap",
            }}
          >
            {item.timestamp}
          </span>
        )}
        {cta}
      </div>
    </div>
  );
}

function ListRail({
  items,
  activeId,
  onSelect,
  renderRow,
  emptyListSlot,
}: {
  items: ThreadShellListItem[];
  activeId: string | null;
  onSelect?: (id: string) => void;
  // Optional Phase 2 hooks. Unset at the two original call sites → the
  // built-in empty card + built-in ListRow render exactly as before.
  renderRow?: (item: ThreadShellListItem, ctx: ThreadShellRowContext) => ReactNode;
  emptyListSlot?: ReactNode;
}) {
  if (items.length === 0) {
    if (emptyListSlot !== undefined) return <>{emptyListSlot}</>;
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          background: SURFACE.emptyBg,
          border: `1px dashed ${SURFACE.borderSoft}`,
          borderRadius: 14,
        }}
      >
        <div style={{ fontSize: 13, color: SURFACE.inkMuted, fontFamily: FONT }}>
          Nothing in this view.
        </div>
      </div>
    );
  }

  // Bespoke-row path (client/admin adopters): emit the adapter's exact row
  // markup, keyed + positioned by the shell. No wrapper card — the adapter's
  // scaffold owns the list container so the dense console rows are pixel-
  // identical to the pre-adoption surface.
  if (renderRow) {
    return (
      <>
        {items.map((item, idx) => (
          <Fragment key={item.id}>
            {renderRow(item, {
              active: activeId === item.id,
              isLast: idx === items.length - 1,
              index: idx,
              select: () => onSelect?.(item.id),
            })}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <div
      style={{
        background: SURFACE.cardBg,
        border: `1px solid ${SURFACE.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {items.map((item, idx) => (
        <ListRow
          key={item.id}
          item={item}
          active={activeId === item.id}
          onSelect={onSelect}
          isLast={idx === items.length - 1}
        />
      ))}
    </div>
  );
}

function MessageColumn({
  messages,
  canReact,
  canReply,
  canEditMessage,
  actions,
}: {
  messages: ThreadMessage[];
  canReact?: boolean;
  canReply?: boolean;
  canEditMessage?: boolean;
  actions: ThreadShellActions;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: m.outbound ? "flex-end" : "flex-start",
            gap: 3,
          }}
        >
          {m.authorLabel && (
            <span style={{ fontSize: 11, color: SURFACE.inkDim }}>
              {m.authorLabel}
            </span>
          )}
          <div
            style={{
              maxWidth: "78%",
              padding: "9px 12px",
              borderRadius: 12,
              background: m.outbound ? SURFACE.highlightRow : SURFACE.emptyBg,
              border: `1px solid ${SURFACE.borderSoft}`,
              fontSize: 13,
              color: SURFACE.ink,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {m.body}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {m.timestamp && (
              <span style={{ fontSize: 10.5, color: SURFACE.inkDim }}>
                {m.timestamp}
              </span>
            )}
            {canReply && (
              <button
                type="button"
                onClick={() => actions.onReply?.(m.id)}
                style={miniBtn}
              >
                Reply
              </button>
            )}
            {canReact && (
              <button
                type="button"
                onClick={() => actions.onReact?.(m.id, "👍")}
                style={miniBtn}
              >
                React
              </button>
            )}
            {canEditMessage && m.outbound && (
              <button
                type="button"
                onClick={() => actions.onEditMessage?.(m.id)}
                style={miniBtn}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const miniBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
  fontSize: 10.5,
  fontWeight: 600,
  color: SURFACE.ctaColor,
  fontFamily: FONT,
};

function Composer({ onCompose }: { onCompose?: (text: string) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onCompose?.(trimmed);
    setText("");
  };
  return (
    <div style={{ display: "flex", gap: 8, fontFamily: FONT }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        }}
        placeholder="Write a message…"
        style={{
          flex: 1,
          height: 36,
          padding: "0 12px",
          borderRadius: 9,
          border: `1px solid ${SURFACE.borderSoft}`,
          fontSize: 13,
          fontFamily: FONT,
          color: SURFACE.ink,
          outline: "none",
        }}
      />
      <button
        type="button"
        onClick={send}
        style={{
          height: 36,
          padding: "0 14px",
          borderRadius: 9,
          border: "none",
          background: SURFACE.ctaColor,
          color: "#fff",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        Send
      </button>
    </div>
  );
}

export function ThreadShell({
  inquiries,
  activeId,
  messages,
  details,
  // role is part of the contract for adopter symmetry; the shell renders
  // off resolved view-model data, so it is not branched on here. Underscore
  // marks it intentionally retained-but-unread (lint allowed-unused rule).
  role: _role,
  canCompose,
  canReact,
  canReply,
  canEditMessage,
  actions,
  rightRailSlot,
  tabsSlot,
  secondaryThreadSlot,
  renderRow,
  listHeaderSlot,
  emptyListSlot,
  scaffold,
}: ThreadShellProps) {
  // ── Phase 2 scaffold path (plan §3) ───────────────────────────────────
  // Reached ONLY when an adopter supplies `scaffold`. The shell composes
  // the three regions once (the list iteration + region order that is
  // duplicated verbatim across the client + admin consoles) and hands
  // them to the role's outer markup. The adapter's scaffold owns the
  // grid + mobile CSS + panes, so the dense console is byte-identical;
  // the shell owns only the shared orchestration. Returns above the
  // original two branches so those stay byte-for-byte unchanged when
  // `scaffold` is absent (landed talent-inbox adoption: untouched).
  if (scaffold) {
    const threadRegion = (
      <>
        {tabsSlot}
        {details}
        {messages != null && (
          <MessageColumn
            messages={messages}
            canReact={canReact}
            canReply={canReply}
            canEditMessage={canEditMessage}
            actions={actions}
          />
        )}
        {canCompose && <Composer onCompose={actions.onCompose} />}
        {secondaryThreadSlot}
      </>
    );
    return (
      <>
        {scaffold({
          listHeader: listHeaderSlot ?? null,
          list: (
            <ListRail
              items={inquiries}
              activeId={activeId}
              onSelect={actions.onSelectInquiry}
              renderRow={renderRow}
              emptyListSlot={emptyListSlot}
            />
          ),
          thread: threadRegion,
        })}
      </>
    );
  }

  const hasThread =
    activeId != null &&
    ((messages != null && messages.length >= 0) || details != null);

  // List-only surface (talent inbox): render just the shared list rail so
  // the adopting surface keeps its own role-specific filter chrome as a
  // sibling. No thread region, no layout shift vs. the prior bespoke list.
  if (!hasThread) {
    return (
      <ListRail
        items={inquiries}
        activeId={activeId}
        onSelect={actions.onSelectInquiry}
      />
    );
  }

  // Thread surface (client/admin adoption): list rail + detail region,
  // optional right rail. Each region renders only when its data/slot is
  // supplied so a partial adopter never gets empty scaffolding.
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        fontFamily: FONT,
      }}
    >
      <div style={{ flex: "0 0 340px", maxWidth: 340 }}>
        <ListRail
          items={inquiries}
          activeId={activeId}
          onSelect={actions.onSelectInquiry}
        />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: SURFACE.cardBg,
          border: `1px solid ${SURFACE.borderSoft}`,
          borderRadius: 14,
          padding: 16,
        }}
      >
        {tabsSlot}
        {details}
        {messages != null && (
          <MessageColumn
            messages={messages}
            canReact={canReact}
            canReply={canReply}
            canEditMessage={canEditMessage}
            actions={actions}
          />
        )}
        {canCompose && <Composer onCompose={actions.onCompose} />}
        {secondaryThreadSlot}
      </div>

      {rightRailSlot && (
        <div style={{ flex: "0 0 300px", maxWidth: 300 }}>{rightRailSlot}</div>
      )}
    </div>
  );
}
