"use client";

/**
 * Inbox pane (L1, boards D01-D03, D11, M01, M10). Pure over `InboxProps`
 * (contracts.ts, L2): the shell owns loading/live-patching/routing, this
 * component only renders `rows` — narrowing, grouping and search are done
 * here with the pure helpers in `lib/messages-v5/inbox-view.ts` so they're
 * covered by their own unit tests, not buried in JSX.
 *
 * Desktop grammar also covers the 1194 tablet width (D-MSG-62: the kit
 * handles density, the pane just gets narrower — D11). Below 900 the shell
 * mounts the mobile variant (M01): a big title, the same three segments, a
 * search field plus one Filter button that opens the kit's FilterSheet
 * (M10), full-width rows and the same day/state grouping headers. The
 * bottom tab bar with its unread badge is the shell's (L2), not drawn here.
 */

import { useEffect, useMemo, useState } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

import { Btn, Chip, EmptyState, FilterChips, FilterSheet, Icon, InboxRowV5, InboxSegments, Skeleton, fill, type InboxFilterKey } from "../kit";
import { applyInboxFilters, groupInboxRows, inboxSegmentCounts, rowsForSegment, rowsForSellerFilter, searchInboxRows, sellerFilterCounts, type SellerInboxFilter } from "@/lib/messages-v5/inbox-view";
import type { InboxProps } from "./contracts";

/** The board's own chip set (D01 `.chips`, M10 Filter sheet): Mine, Unassigned, Unread, Payment issues, Orders, Offers, Appointments. */
const CHIP_KEYS: readonly InboxFilterKey[] = ["mine", "unassigned", "unread", "paymentIssues", "orders", "offers", "appointments"];
/** A solo talent has no team: Mine / Unassigned would always match everything or nothing. */
const SELLER_CHIP_KEYS: readonly InboxFilterKey[] = ["unread", "paymentIssues", "offers", "appointments"];

/**
 * `now` (optional, contracts.ts) keeps the day-boundary grouping
 * deterministic in tests and defaults to `new Date()`; locale is read locally
 * via `useDashboardLocale()` like the rest of the dashboard.
 */
export function Inbox(props: InboxProps) {
  const { rows, filter, onFilter, chips, onToggleChip, search, onSearch, selectedId, onSelect, loading, error, onRetry, counts, onNew, currentUserId, copy, variant, now: nowProp, onSearchSubmit, seller, sellerChrome } = props;
  const chipKeys = seller ? SELLER_CHIP_KEYS : CHIP_KEYS;
  const title = sellerChrome?.inboxTitle ?? copy.inbox.title;
  // F35: a talent with zero conversations gets a first run, and no filters until there is something to filter.
  // F54: `rows` is one segment only (Needs action by default), so the first run keys on her total.
  const firstRun = Boolean(sellerChrome?.firstRunTitle) && sellerChrome?.totalConversations === 0 && !loading && !error && rows.length === 0;
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const locale = useDashboardLocale();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Talent: her four filters (All, Needs reply, Quotes out, Agency) replace the staff segments and chips.
  const sellerFilters = sellerChrome?.filters ?? null;
  const [sellerFilter, setSellerFilter] = useState<SellerInboxFilter>("all");
  const sellerCounts = useMemo(() => sellerFilterCounts(rows), [rows]);
  const waitingLine = sellerFilters && sellerChrome?.waitingOnYou && sellerCounts.needs > 0 ? fill(sellerChrome.waitingOnYou, { count: sellerCounts.needs }) : null;

  const segmentRows = useMemo(() => (sellerFilters ? rowsForSellerFilter(rows, sellerFilter) : rowsForSegment(rows, filter, now)), [rows, filter, now, sellerFilters, sellerFilter]);
  const chipFilteredRows = useMemo(() => applyInboxFilters(segmentRows, chips, { currentUserId }), [segmentRows, chips, currentUserId]);
  const visibleRows = useMemo(() => searchInboxRows(chipFilteredRows, search), [chipFilteredRows, search]);
  const groupFilter = sellerFilters ? (sellerFilter === "needs" ? "needs" : "all") : filter;
  const groups = useMemo(() => groupInboxRows(visibleRows, groupFilter, copy, now, locale), [visibleRows, groupFilter, copy, now, locale]);
  const flatRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const computedCounts = useMemo(() => inboxSegmentCounts(rows, now), [rows, now]);
  const segmentCounts = {
    needs: counts.needs ?? computedCounts.needs,
    wait: counts.wait ?? computedCounts.wait,
    all: counts.all ?? computedCounts.all,
  };

  // Client-side narrowing over the currently visible chips/search, for the
  // Filter sheet's "Show N conversations" count. Toggling a chip in the
  // sheet commits immediately via onToggleChip (same as the desktop chips
  // row), so this is always a synchronous, known number.
  const sheetResultCount = useMemo(() => searchInboxRows(applyInboxFilters(segmentRows, chips, { currentUserId }), search).length, [segmentRows, chips, currentUserId, search]);

  // j/k moves the highlighted row, Enter opens it. Ignored while typing in
  // the search field so a "j" in a client name doesn't hijack the list.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (flatRows.length === 0) return;
      const idx = flatRows.findIndex((row) => row.id === selectedId);
      if (e.key === "j") {
        e.preventDefault();
        const next = flatRows[idx < 0 ? 0 : Math.min(flatRows.length - 1, idx + 1)];
        if (next) onSelect(next.id);
      } else if (e.key === "k") {
        e.preventDefault();
        const prev = flatRows[idx < 0 ? 0 : Math.max(0, idx - 1)];
        if (prev) onSelect(prev.id);
      } else if (e.key === "Enter" && idx >= 0) {
        onSelect(flatRows[idx]!.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flatRows, selectedId, onSelect]);

  const body = loading ? (
    <Skeleton rows={6} variant={variant} copy={copy} />
  ) : error ? (
    <EmptyState variant={variant} title={copy.inbox.empty.failedTitle} body={copy.inbox.empty.failedBody} action={{ label: copy.inbox.empty.failedAction, onClick: onRetry }} />
  ) : firstRun ? (
    <div data-inbox-first-run>
      <EmptyState variant={variant} icon="link" title={sellerChrome?.firstRunTitle ?? ""} body={sellerChrome?.firstRunBody ?? ""} />
      {sellerChrome?.firstRunAction ?? null}
    </div>
  ) : visibleRows.length === 0 ? (
    <InboxEmpty variant={variant} filter={sellerFilters ? "all" : filter} search={search} copy={copy} onClearSearch={() => onSearch("")} onShowWaiting={() => onFilter("wait")} />
  ) : (
    <div className={variant === "mobile" ? "mx-list" : "ib-list"} data-inbox-groups>
      {groups.map((group) => (
        <div key={group.key}>
          <div className={variant === "mobile" ? "mx-gh" : "grp-h"}>{group.label}</div>
          {group.rows.map((row) => (
            <InboxRowV5 key={row.id} row={row} copy={copy} variant={variant} selected={row.id === selectedId} currentUserId={currentUserId} now={now} locale={locale} onOpen={onSelect} seller={seller} />
          ))}
        </div>
      ))}
    </div>
  );

  if (variant === "mobile") {
    return (
      <div className="pane inbox mx" data-inbox-pane="mobile">
        <div className="mx-ih">
          <h1>{title}</h1>
          {waitingLine && !firstRun ? <p data-inbox-waiting style={{ margin: 0, fontSize: 12.5, color: "var(--msgv5-ink-2)" }}>{waitingLine}</p> : null}
          {firstRun ? null : sellerFilters ? <SellerFilters labels={sellerFilters} counts={sellerCounts} value={sellerFilter} onChange={setSellerFilter} variant="mobile" /> : <InboxSegments value={filter} counts={segmentCounts} copy={copy} variant="mobile" onChange={onFilter} />}
          {firstRun ? null : <div className="tools">
            <div className="mx-search">
              <Icon name="search" size={16} />
              <input type="search" value={search} placeholder={copy.inbox.search} aria-label={copy.inbox.search} onChange={(e) => onSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSearchSubmit?.(search); }} />
            </div>
            {sellerFilters ? null : (
              <Btn size="lg" icon="layers" iconSize={15} className="filt" onClick={() => setSheetOpen(true)}>
                {copy.inbox.filter}
                {chips.length > 0 ? ` · ${chips.length}` : ""}
              </Btn>
            )}
          </div>}
        </div>
        {body}
        <FilterSheet
          open={sheetOpen}
          active={chips}
          copy={copy}
          keys={chipKeys}
          resultCount={sheetResultCount}
          onToggle={onToggleChip}
          onClear={() => chips.forEach((key) => onToggleChip(key))}
          onApply={() => setSheetOpen(false)}
          onClose={() => setSheetOpen(false)}
        />
      </div>
    );
  }

  // The shell's grid (`shell.css`) addresses this root as `.msgs > .pane.inbox`
  // and the shell root already carries `.msgv5`, so no wrapper here.
  return (
    <div className="pane inbox" data-inbox-pane="desktop">
      <div className="ib-head">
        <div className="row">
          <h2>{title}</h2>
          {firstRun ? null : <span className="cnt-txt">{fill(rows.length === 1 ? copy.inbox.threadsOne : copy.inbox.threads, { count: rows.length })}</span>}
          <Btn size="sm" icon="plus" iconSize={13} onClick={onNew}>
            {sellerChrome?.newConversation ?? copy.inbox.newConversation}
          </Btn>
        </div>
        {firstRun ? null : (
          <>
            {waitingLine ? <p data-inbox-waiting style={{ margin: 0, fontSize: 12.5, color: "var(--msgv5-ink-2)" }}>{waitingLine}</p> : null}
            {sellerFilters ? <SellerFilters labels={sellerFilters} counts={sellerCounts} value={sellerFilter} onChange={setSellerFilter} variant="desktop" /> : <InboxSegments value={filter} counts={segmentCounts} copy={copy} variant="desktop" onChange={onFilter} />}
            <div className="search">
              <Icon name="search" size={14} />
              <input type="search" value={search} placeholder={copy.inbox.search} aria-label={copy.inbox.search} onChange={(e) => onSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSearchSubmit?.(search); }} />
            </div>
            {sellerFilters ? null : <FilterChips active={chips} copy={copy} keys={chipKeys} variant="desktop" onToggle={onToggleChip} />}
          </>
        )}
      </div>
      {body}
    </div>
  );
}

function SellerFilters({ labels, counts, value, onChange, variant }: {
  readonly labels: NonNullable<NonNullable<InboxProps["sellerChrome"]>["filters"]>;
  readonly counts: Record<SellerInboxFilter, number>;
  readonly value: SellerInboxFilter;
  readonly onChange: (next: SellerInboxFilter) => void;
  readonly variant: "desktop" | "mobile";
}) {
  const keys: readonly SellerInboxFilter[] = ["all", "needs", "quotes", "agency"];
  return (
    <div className={variant === "mobile" ? "mx-chips" : "chips"} role="group" data-inbox-seller-filters>
      {keys.map((key) => (
        <Chip key={key} soft on={value === key} onClick={() => onChange(key)}>
          {labels[key]}
          {key !== "all" && counts[key] > 0 ? ` · ${counts[key]}` : ""}
        </Chip>
      ))}
    </div>
  );
}

function InboxEmpty({
  variant,
  filter,
  search,
  copy,
  onClearSearch,
  onShowWaiting,
}: {
  readonly variant: "desktop" | "mobile";
  readonly filter: InboxProps["filter"];
  readonly search: string;
  readonly copy: InboxProps["copy"];
  readonly onClearSearch: () => void;
  readonly onShowWaiting: () => void;
}) {
  if (search.trim()) {
    return (
      <EmptyState
        variant={variant}
        title={fill(copy.inbox.empty.searchTitle, { query: search.trim() })}
        body={copy.inbox.empty.searchBody}
        action={{ label: copy.inbox.empty.searchAction, onClick: onClearSearch }}
      />
    );
  }
  if (filter === "needs") {
    return (
      <EmptyState
        variant={variant}
        title={copy.inbox.empty.needsTitle}
        body={copy.inbox.empty.needsBody}
        action={{ label: copy.inbox.empty.needsAction, onClick: onShowWaiting }}
      />
    );
  }
  if (filter === "wait") {
    return <EmptyState variant={variant} title={copy.inbox.empty.waitTitle} body={copy.inbox.empty.waitBody} />;
  }
  return <EmptyState variant={variant} title={copy.inbox.empty.allTitle} body={copy.inbox.empty.allBody} />;
}
