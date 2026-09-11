"use client";

/**
 * GlobalSearchOverlay — the workspace's record search (W53 board).
 *
 * ⌘K, or the search button in the top bar, opens one field over the page.
 * Results come from `globalSearch` (lib/search/global-search.ts): the
 * request-scoped client, so RLS decides what a person may find. They are
 * grouped the way the rail is worded — Clients · Projects · Sales ·
 * Appointments · Catalog · Messages · People — and the row under the cursor
 * fills the pane on the right: what it is, where it lives, and the two
 * things a person does next from a search (open the record, book).
 *
 * SEARCH NEVER CREATES RECORDS. The footer says so; "New client" lives in
 * Clients, exactly as the board has it.
 *
 * NOT WIRED (said on the pane, not hidden): the client pane's "Due now",
 * "Next booking" and "Pass" lines need a per-client balance reader the
 * search action does not carry yet, so the pane shows the record's own
 * summary and "Collect" is disabled with the reason. Recorded as D-POS-12.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { globalSearch } from "@/lib/search/global-search";
import type { SearchResult } from "@/lib/search/global-search-types";
import { DESTINATIONS, type DestinationId } from "@/lib/workspace/destinations";
import { useDashboardText } from "../dashboard-i18n";
import { Icon } from "../primitives";
import { meetsRole, useAdminShell } from "../state";

export const GLOBAL_SEARCH_OPEN_EVENT = "tulala:open-global-search";

const K = "dashboard.workspaceShell.search";

/** Each result kind, under the rail word for where it lives. */
const KIND_DESTINATION: Record<SearchResult["kind"], DestinationId> = {
  client: "clients",
  inquiry: "projects",
  sale: "sales",
  booking: "appts",
  catalog: "catalog",
  message: "messages",
  talent: "people",
};

const KIND_ORDER: readonly SearchResult["kind"][] = [
  "client",
  "inquiry",
  "sale",
  "booking",
  "catalog",
  "message",
  "talent",
];

const MIN_QUERY = 2;

export function GlobalSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, state, openDrawer, adminBasePath, tenantSlug, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setFailed(false);
    setCursor(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setBusy(false);
      return;
    }
    const mine = ++requestId.current;
    setBusy(true);
    const id = window.setTimeout(() => {
      globalSearch(q)
        .then((rows) => {
          if (mine !== requestId.current) return;
          setResults(rows);
          setFailed(false);
          setCursor(0);
        })
        .catch(() => {
          if (mine !== requestId.current) return;
          setFailed(true);
        })
        .finally(() => {
          if (mine === requestId.current) setBusy(false);
        });
    }, 180);
    return () => window.clearTimeout(id);
  }, [open, query]);

  // The action's hrefs are slug-shaped; on a branded host the admin base has
  // no slug, so the prefix is swapped for whichever applies here.
  const localHref = useCallback(
    (href: string) => (tenantSlug ? href.replace(`/${tenantSlug}/admin`, adminBasePath) : href),
    [adminBasePath, tenantSlug],
  );

  const ordered = KIND_ORDER.flatMap((kind) => results.filter((r) => r.kind === kind));
  const selected = ordered[Math.min(cursor, Math.max(0, ordered.length - 1))] ?? null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (ordered.length === 0 ? 0 : (c + 1) % ordered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (ordered.length === 0 ? 0 : (c - 1 + ordered.length) % ordered.length));
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      window.location.assign(localHref(selected.href));
    }
  };

  if (!open) return null;

  const canBook = meetsRole(state.role, "manager");
  const trimmed = query.trim();

  return (
    <div
      data-tulala-global-search
      role="dialog"
      aria-modal="true"
      aria-label={t(`${K}.label`)}
      className="fixed inset-0 z-[120] flex items-start justify-center bg-admin-ink/45 px-[16px] pt-[72px] font-admin-body"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(560px,calc(100vh-120px))] w-full max-w-[760px] flex-col overflow-hidden rounded-[14px] border border-admin-border-soft bg-admin-card shadow-admin-hover">
        <div className="flex items-center gap-[10px] border-b border-admin-border-soft px-[16px] py-[12px]">
          <Icon name="search" size={16} stroke={1.75} color="var(--color-admin-ink-dim)" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t(`${K}.placeholder`)}
            aria-label={t(`${K}.label`)}
            className="min-w-0 flex-1 appearance-none border-0 bg-transparent text-[15px] text-admin-ink shadow-none outline-none focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none placeholder:text-admin-ink-dim"
          />
          <span className="whitespace-nowrap text-admin-11h text-admin-ink-dim">
            {effectiveTenant.name} · {t(`${K}.allTypes`)} · ⌘K
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr]">
          <div role="listbox" aria-label={t(`${K}.results`)} className="min-h-0 overflow-y-auto border-r border-admin-border-soft py-[6px]">
            {trimmed.length < MIN_QUERY ? (
              <p className="m-0 px-[18px] py-[18px] text-admin-13 text-admin-ink-muted">{t(`${K}.typeToSearch`)}</p>
            ) : failed ? (
              <p className="m-0 px-[18px] py-[18px] text-admin-13 text-admin-red">{t(`${K}.failed`)}</p>
            ) : ordered.length === 0 && !busy ? (
              <p className="m-0 px-[18px] py-[18px] text-admin-13 text-admin-ink-muted">{t(`${K}.empty`)}</p>
            ) : (
              KIND_ORDER.map((kind) => {
                const rows = ordered.filter((r) => r.kind === kind);
                if (rows.length === 0) return null;
                return (
                  <div key={kind}>
                    <div className="px-[18px] pb-[2px] pt-[10px] text-admin-10h font-bold uppercase tracking-[0.08em] text-admin-ink-dim">
                      {copy.t(DESTINATIONS[KIND_DESTINATION[kind]].label)}
                    </div>
                    {rows.map((row) => {
                      const index = ordered.indexOf(row);
                      const active = index === cursor;
                      return (
                        <button
                          key={`${row.kind}:${row.id}`}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => window.location.assign(localHref(row.href))}
                          className={`block w-full cursor-pointer px-[18px] py-[7px] text-left ${active ? "bg-admin-surface-alt" : "hover:bg-admin-surface"}`}
                        >
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-admin-13 font-semibold text-admin-ink">
                            {row.title}
                          </span>
                          {row.snippet && (
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-admin-ink-muted">
                              {row.snippet}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
            {busy && <p className="m-0 px-[18px] py-[8px] text-admin-11h text-admin-ink-dim">{t(`${K}.searching`)}</p>}
          </div>
          <div className="min-h-0 overflow-y-auto px-[18px] py-[14px]">
            {selected ? (
              <>
                <div className="text-admin-10h font-bold uppercase tracking-[0.08em] text-admin-ink-dim">
                  {selected.title} · {copy.t(DESTINATIONS[KIND_DESTINATION[selected.kind]].label)}
                </div>
                <div className="mt-[10px] rounded-[10px] border border-admin-border-soft px-[14px] py-[10px] text-admin-13 text-admin-ink">
                  {selected.snippet || t(`${K}.noSummary`)}
                </div>
                <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
                  <a
                    href={localHref(selected.href)}
                    className="inline-flex h-[34px] items-center rounded-[9px] border border-admin-brand bg-admin-brand px-[14px] text-admin-13 font-semibold text-white no-underline"
                  >
                    {t(`${K}.openRecord`)}
                  </a>
                  {selected.kind === "client" && (
                    <button
                      type="button"
                      disabled
                      title={t(`${K}.collectOff`)}
                      className="inline-flex h-[34px] cursor-not-allowed items-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink opacity-50"
                    >
                      {t(`${K}.collect`)}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!canBook}
                    title={canBook ? undefined : t(`${K}.bookOff`)}
                    onClick={() => {
                      onClose();
                      openDrawer("new-booking");
                    }}
                    className={`inline-flex h-[34px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink ${canBook ? "cursor-pointer hover:border-admin-border-strong" : "cursor-not-allowed opacity-50"}`}
                  >
                    {t(`${K}.newAppointment`)}
                  </button>
                </div>
              </>
            ) : (
              <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.paneEmpty`)}</p>
            )}
            <p className="mt-[14px] text-[12px] text-admin-ink-muted">{t(`${K}.neverCreates`)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
