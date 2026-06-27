"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bookmark, Check, ExternalLink, Loader2, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The 2026 favorites surface — a centered, app-like MODAL (not the old
 * slide-out drawer). Presentational + fully controlled: the public + the
 * client-dashboard wrappers own the data, selection, and the
 * "inquire about the selected" bridge; this file owns the look + the
 * interaction shell.
 *
 * Built on @radix-ui/react-dialog so focus-trap, scroll-lock, ESC, backdrop
 * dismiss, and focus restoration come for free. Portaled to <body>; responsive
 * to a full-screen sheet on phones.
 *
 * Theme-portable: a portal escapes the surface's token cascade, so every color
 * is read off the `--fav-*` CSS vars set inline on the panel (seeded from the
 * `tokens` prop). The one deliberate accent moment (selected ring, count chip,
 * bookmark glyph, focus rings) runs through `--fav-accent` (the tenant
 * `color.accent` token on the public storefront), never a hardcoded gold. The
 * primary CTA uses foreground-on-background for guaranteed AA contrast on both
 * the dark (noir) and light (dashboard) surfaces.
 */

export type FavoriteModalTalent = {
  id: string;
  name: string;
  profileCode: string | null;
  photoUrl: string | null;
  /** Profession / primary type line. Null on surfaces that don't resolve it. */
  primaryType: string | null;
  /** City · Country (or whichever is known). */
  location: string | null;
  /** Canonical profile link (new tab). Null → no "view profile" affordance. */
  profileHref: string | null;
};

export type FavoritesModalCopy = {
  title: string;
  subtitle: string;
  close: string;
  selectAll: string;
  clearSelection: string;
  /** "{selected} of {total} selected" */
  selectedOfCount: string;
  /** disabled / nothing picked */
  inquireZero: string;
  /** exactly one picked */
  inquireOne: string;
  /** "Inquire about the {count} selected" */
  inquireMany: string;
  inquirePending: string;
  clearAll: string;
  /** authed: link to the full favorites page */
  favoritesPageLabel: string;
  /** guest: "Save them forever ..." */
  saveForever: string;
  saveForeverFollows: string;
  viewProfile: string;
  /** "Select {name}" */
  selectAria: string;
  /** "Deselect {name}" */
  deselectAria: string;
  /** "Remove {name}" */
  removeAria: string;
  /** "{count} hidden ..." */
  hiddenUnavailable: string;
  emptyTitle: string;
  emptyDescription: string;
};

export type FavoritesModalTokens = {
  /** Panel ground. */
  bg: string;
  /** Primary text. */
  fg: string;
  /** Hairlines / dividers. */
  border: string;
  /** Secondary text. */
  muted: string;
  /** Accent moment (color.accent). */
  accent: string;
  /** Tile media ground (behind the portrait / monogram). */
  tile: string;
};

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    template,
  );
}

/**
 * Selection state shared by both modal wrappers: default-select every talent
 * when the modal opens, preserve the user's de-selections within the open
 * session, and re-default on the next open. `drop` keeps the set consistent
 * when a talent is removed from favorites while open.
 */
export function useFavoritesSelection(talentIds: readonly string[], open: boolean) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const didInit = useRef(false);

  // Default-select all when the modal opens; preserve de-selections within the
  // open session; re-default on the next open. Callers pass a memoized
  // `talentIds`, so this effect only re-runs when the list or open state change
  // (a mid-session list change does not re-default, because didInit is set).
  useEffect(() => {
    if (!open) {
      didInit.current = false;
      return;
    }
    if (!didInit.current && talentIds.length > 0) {
      setSelectedIds(new Set(talentIds));
      didInit.current = true;
    }
  }, [open, talentIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(talentIds));
  }, [talentIds]);

  const clear = useCallback(() => {
    setSelectedIds(new Set<string>());
  }, []);

  const drop = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { selectedIds, toggle, selectAll, clear, drop };
}

export function FavoritesModalView({
  open,
  onOpenChange,
  talents,
  totalCount,
  loading,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onRemove,
  onClearAll,
  onInquire,
  inquirePending,
  isAuthenticated,
  signupHref,
  favoritesPageHref,
  copy,
  tokens,
  cardCssVars,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talents: FavoriteModalTalent[];
  /** favoriteIds length — drives the "N hidden" note when lookups drop some. */
  totalCount: number;
  loading: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onInquire: () => void;
  inquirePending: boolean;
  isAuthenticated: boolean;
  signupHref: string;
  /** authed-only deep link to the full favorites page. Null → hidden. */
  favoritesPageHref: string | null;
  copy: FavoritesModalCopy;
  tokens: FavoritesModalTokens;
  /** Per-tenant card palette for tiles that escape the cascade (dashboard). */
  cardCssVars?: Record<string, string>;
}) {
  const titleId = useId();
  const descId = useId();

  const selectedCount = selectedIds.size;
  const hasFavorites = totalCount > 0 || talents.length > 0;
  const allSelected = talents.length > 0 && selectedCount >= talents.length;
  const hiddenCount = Math.max(0, totalCount - talents.length);

  const panelStyle = {
    "--fav-bg": tokens.bg,
    "--fav-fg": tokens.fg,
    "--fav-border": tokens.border,
    "--fav-muted": tokens.muted,
    "--fav-accent": tokens.accent,
    "--fav-tile": tokens.tile,
  } as React.CSSProperties;

  const primaryLabel = inquirePending
    ? copy.inquirePending
    : selectedCount === 0
      ? copy.inquireZero
      : selectedCount === 1
        ? copy.inquireOne
        : fill(copy.inquireMany, { count: selectedCount });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-labelledby={titleId}
          aria-describedby={descId}
          style={panelStyle}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "fixed z-[121] flex flex-col bg-[var(--fav-bg)] text-[var(--fav-fg)] shadow-2xl outline-none",
            // Mobile: full-screen safe-area sheet. Desktop: centered card.
            "inset-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88vh] sm:w-[min(64rem,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            "border border-[var(--fav-border)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          )}
        >
          {/* Header */}
          <header className="flex items-start justify-between gap-3 border-b border-[var(--fav-border)] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--fav-border)] text-[var(--fav-accent)]"
              >
                <Bookmark className="size-4" fill="currentColor" />
              </span>
              <div className="min-w-0">
                <Dialog.Title
                  id={titleId}
                  className="font-display text-lg font-medium tracking-wide text-[var(--fav-fg)]"
                >
                  {copy.title}
                  {hasFavorites ? (
                    <span className="ml-2 align-middle font-mono text-[11px] tabular-nums text-[var(--fav-muted)]">
                      {totalCount || talents.length}
                    </span>
                  ) : null}
                </Dialog.Title>
                <p
                  id={descId}
                  className="mt-0.5 text-[12px] leading-relaxed text-[var(--fav-muted)]"
                >
                  {hasFavorites ? copy.subtitle : copy.emptyTitle}
                </p>
              </div>
            </div>
            <Dialog.Close
              aria-label={copy.close}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--fav-muted)] outline-none transition-colors hover:bg-[var(--fav-fg)]/10 hover:text-[var(--fav-fg)] focus-visible:ring-2 focus-visible:ring-[var(--fav-accent)]"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>

          {/* Select toolbar — only once the tiles have resolved (avoids a
              transient "N of 0 selected" while the lookup is in flight). */}
          {talents.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-b border-[var(--fav-border)] px-5 py-2.5 sm:px-6">
              <span className="text-[12px] tabular-nums text-[var(--fav-muted)]">
                {fill(copy.selectedOfCount, {
                  selected: selectedCount,
                  total: talents.length,
                })}
              </span>
              <button
                type="button"
                onClick={allSelected ? onClearSelection : onSelectAll}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fav-fg)]/70 outline-none transition-colors hover:bg-[var(--fav-fg)]/[0.06] hover:text-[var(--fav-fg)] focus-visible:ring-2 focus-visible:ring-[var(--fav-accent)]"
              >
                {allSelected ? copy.clearSelection : copy.selectAll}
              </button>
            </div>
          ) : null}

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {!hasFavorites ? (
              <EmptyState copy={copy} />
            ) : loading && talents.length === 0 ? (
              <TileGrid>
                {Array.from({ length: Math.min(totalCount || 4, 8) }).map((_, i) => (
                  <TileSkeleton key={i} />
                ))}
              </TileGrid>
            ) : (
              <>
                <TileGrid>
                  {talents.map((talent) => (
                    <FavoriteTile
                      key={talent.id}
                      talent={talent}
                      selected={selectedIds.has(talent.id)}
                      onToggle={() => onToggleSelect(talent.id)}
                      onRemove={() => onRemove(talent.id)}
                      copy={copy}
                      cardCssVars={cardCssVars}
                    />
                  ))}
                </TileGrid>
                {hiddenCount > 0 ? (
                  <p className="mt-4 text-center text-[11px] text-[var(--fav-muted)]">
                    {fill(copy.hiddenUnavailable, { count: hiddenCount })}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* Footer */}
          {hasFavorites ? (
            <footer className="flex flex-col gap-3 border-t border-[var(--fav-border)] px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={onInquire}
                disabled={inquirePending || selectedCount === 0}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-semibold tracking-wide outline-none transition-[opacity,transform] duration-200",
                  "bg-[var(--fav-fg)] text-[var(--fav-bg)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--fav-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fav-bg)]",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                {inquirePending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {primaryLabel}
              </button>

              <div className="flex items-center justify-between gap-3 text-[12px]">
                {isAuthenticated && favoritesPageHref ? (
                  <a
                    href={favoritesPageHref}
                    onClick={() => onOpenChange(false)}
                    className="text-[var(--fav-muted)] underline-offset-4 outline-none transition-colors hover:text-[var(--fav-fg)] hover:underline focus-visible:text-[var(--fav-fg)]"
                  >
                    {copy.favoritesPageLabel}
                  </a>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex items-center gap-1.5 text-[var(--fav-muted)] outline-none transition-colors hover:text-[var(--fav-fg)] focus-visible:text-[var(--fav-fg)]"
                >
                  <Trash2 className="size-3.5" />
                  {copy.clearAll}
                </button>
              </div>

              {!isAuthenticated ? (
                <p className="text-[11px] leading-relaxed text-[var(--fav-muted)]">
                  <a
                    href={signupHref}
                    onClick={() => onOpenChange(false)}
                    className="text-[var(--fav-fg)]/80 underline-offset-4 outline-none transition-colors hover:text-[var(--fav-fg)] hover:underline focus-visible:text-[var(--fav-fg)]"
                  >
                    {copy.saveForever}
                  </a>{" "}
                  {copy.saveForeverFollows}
                </p>
              ) : null}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {children}
    </ul>
  );
}

function FavoriteTile({
  talent,
  selected,
  onToggle,
  onRemove,
  copy,
  cardCssVars,
}: {
  talent: FavoriteModalTalent;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
  copy: FavoritesModalCopy;
  cardCssVars?: Record<string, string>;
}) {
  // A non-null photo that FAILS to load degrades to the editorial monogram,
  // never a blank box (house rule: real imagery, never a placeholder box).
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = Boolean(talent.photoUrl) && !imgFailed;
  const typeLocation = [talent.primaryType, talent.location]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("  ·  ");

  return (
    <li
      className="group/tile flex flex-col gap-2.5"
      style={cardCssVars as React.CSSProperties | undefined}
    >
      <div
        className={cn(
          "relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[var(--fav-tile)] transition-shadow duration-200",
          selected
            ? "shadow-[0_0_0_2px_var(--fav-accent)]"
            : "shadow-[inset_0_0_0_1px_var(--fav-border)]",
        )}
      >
        {/* Real editorial portrait (4:5), never a placeholder box. */}
        {showPhoto && talent.photoUrl ? (
          <Image
            src={talent.photoUrl}
            alt={talent.name}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover transition-transform duration-500 group-hover/tile:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/tile:scale-100"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-full items-center justify-center px-3 text-center font-display text-sm tracking-[0.16em] text-[var(--fav-muted)]"
          >
            {talent.name}
          </div>
        )}

        {/* Whole-photo select target. */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={fill(selected ? copy.deselectAria : copy.selectAria, {
            name: talent.name,
          })}
          className="absolute inset-0 z-[1] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fav-accent)]"
        />

        {/* Select indicator (top-left). */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-2 top-2 z-[2] inline-flex size-6 items-center justify-center rounded-full border backdrop-blur-sm transition-colors",
            selected
              ? "border-[var(--fav-accent)] bg-[var(--fav-accent)] text-[var(--fav-bg)]"
              : "border-white/70 bg-black/30 text-transparent",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>

        {/* Remove (top-right) — sits above the select target. */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={fill(copy.removeAria, { name: talent.name })}
          className="absolute right-2 top-2 z-[3] inline-flex size-7 items-center justify-center rounded-full bg-black/45 text-white/85 opacity-0 outline-none backdrop-blur-sm transition-opacity duration-150 hover:bg-black/70 hover:text-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--fav-accent)] group-hover/tile:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Info block */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-display text-[15px] leading-tight text-[var(--fav-fg)]">
          {talent.name}
        </p>
        {typeLocation ? (
          <p className="truncate text-[11px] text-[var(--fav-muted)]">
            {typeLocation}
          </p>
        ) : null}
        {talent.profileHref ? (
          <a
            href={talent.profileHref}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex w-fit items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fav-muted)] underline-offset-4 outline-none transition-colors hover:text-[var(--fav-fg)] hover:underline focus-visible:text-[var(--fav-fg)]"
          >
            {copy.viewProfile}
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function TileSkeleton() {
  return (
    <li className="flex animate-pulse flex-col gap-2.5">
      <div className="aspect-[4/5] w-full rounded-xl bg-[var(--fav-fg)]/[0.06]" />
      <div className="h-3.5 w-2/3 rounded bg-[var(--fav-fg)]/[0.08]" />
      <div className="h-3 w-1/2 rounded bg-[var(--fav-fg)]/[0.05]" />
    </li>
  );
}

function EmptyState({ copy }: { copy: FavoritesModalCopy }) {
  return (
    <div className="mx-auto flex max-w-xs flex-col items-center py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full border border-[var(--fav-border)] text-[var(--fav-muted)]">
        <Bookmark className="size-5" />
      </span>
      <p className="mt-4 font-display text-base tracking-wide text-[var(--fav-fg)]">
        {copy.emptyTitle}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--fav-muted)]">
        {copy.emptyDescription}
      </p>
    </div>
  );
}
