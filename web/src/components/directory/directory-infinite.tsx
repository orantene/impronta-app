"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { setTalentSaved } from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";
import type { DirectoryCardDTO } from "@/lib/directory/types";
import type { DirectoryPageResponse } from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_DEFAULT } from "@/lib/directory/types";
import { MAX_CARD_FIT_LABELS } from "@/lib/directory/talent-card-dto";
import type { DirectorySortValue } from "@/lib/directory/types";

import { ContactTalentButton, SaveTalentButton } from "./directory-inquiry-actions";
import { TalentCard } from "./talent-card";
import { TalentDirectoryListRow } from "./talent-directory-list-row";
import { usePublicDiscoveryState } from "./public-discovery-state";
import {
  applyCanonicalDirectoryFetchSearchParams,
  type DirectoryViewMode,
} from "@/lib/directory/search-params";
import {
  formatPreviewDialogAria,
  formatPreviewImageAlt,
  type DirectoryUiCopy,
} from "@/lib/directory/directory-ui-copy";
import { clientLocaleHref } from "@/i18n/client-directory-href";

type DirectoryPreviewResponse = {
  id: string;
  profileCode: string;
  displayName: string;
  shortBio: string | null;
  heightCm: number | null;
  primaryTalentTypeLabel: string;
  locationLabel: string;
  livesInLabel: string;
  originallyFromLabel: string;
  fitLabels: string[];
  skills: string[];
  languages: string[];
  image: {
    url: string;
    width: number | null;
    height: number | null;
  } | null;
};

async function fetchDirectoryPageClient(
  taxKey: string,
  cursor: string | null,
  locale: "en" | "es",
  sort: DirectorySortValue,
  query: string,
  locationSlug: string,
  heightMinCm: number | null,
  heightMaxCm: number | null,
  loadErrorMessage: string,
): Promise<DirectoryPageResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(DIRECTORY_PAGE_SIZE_DEFAULT));
  const taxonomyTermIds = taxKey
    ? taxKey.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  applyCanonicalDirectoryFetchSearchParams(params, {
    taxonomyTermIds,
    locale,
    sort,
    query,
    locationSlug,
    heightMinCm,
    heightMaxCm,
  });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/directory?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? loadErrorMessage);
  }
  return res.json() as Promise<DirectoryPageResponse>;
}

export function DirectoryInfiniteGrid({
  taxonomyTermIds,
  initialPage,
  locale = "en",
  sort,
  query,
  locationSlug,
  heightMinCm = null,
  heightMaxCm = null,
  view = "grid",
  initialSavedIds = [],
  ui,
}: {
  taxonomyTermIds: string[];
  initialPage: DirectoryPageResponse;
  locale?: "en" | "es";
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  view?: DirectoryViewMode;
  initialSavedIds?: string[];
  ui: DirectoryUiCopy;
}) {
  const pathname = usePathname();
  const taxKey = [...taxonomyTermIds].sort().join(",");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [preview, setPreview] = useState<DirectoryCardDTO | null>(null);
  const [previewDetails, setPreviewDetails] =
    useState<DirectoryPreviewResponse | null>(null);
  const [, startTransition] = useTransition();
  const discoveryState = usePublicDiscoveryState();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isSaved = useCallback(
    (id: string) =>
      hydrated ? discoveryState.isSaved(id) : initialSavedIds.includes(id),
    [discoveryState, hydrated, initialSavedIds],
  );

  const toggleSave = useCallback(
    (id: string) => {
      startTransition(async () => {
        const saved = isSaved(id);
        const nextWantSaved = !saved;
        discoveryState.setSavedState(id, nextWantSaved);
        const res = await setTalentSaved(id, nextWantSaved);
        if (!res.ok) {
          discoveryState.setSavedState(id, saved);
          discoveryState.setFlash({
            tone: "error",
            title: ui.inquiry.flashCouldNotUpdateSaved,
            message: res.error,
          });
        }
      });
    },
    [discoveryState, isSaved, startTransition, ui.inquiry.flashCouldNotUpdateSaved],
  );

  const openPreview = useCallback((card: DirectoryCardDTO) => {
    setPreview(card);
    setPreviewDetails(null);
    queueMicrotask(() => dialogRef.current?.showModal());
    const params = new URLSearchParams();
    if (locale !== "en") params.set("locale", locale);
    const qs = params.toString();
    void fetch(`/api/directory/preview/${encodeURIComponent(card.id)}${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as DirectoryPreviewResponse;
      })
      .then((data) => {
        if (data?.id === card.id) setPreviewDetails(data);
      });
  }, [locale]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: [
        "directory",
        taxKey,
        locale,
        sort,
        query,
        locationSlug,
        heightMinCm ?? "",
        heightMaxCm ?? "",
        view,
      ],
      queryFn: ({ pageParam }) =>
        fetchDirectoryPageClient(
          taxKey,
          pageParam,
          locale,
          sort,
          query,
          locationSlug,
          heightMinCm ?? null,
          heightMaxCm ?? null,
          ui.loadResultsError,
        ),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      initialData: {
        pages: [initialPage],
        pageParams: [null],
      },
    });

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (
        entry?.isIntersecting &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: "240px",
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  const items =
    data?.pages.flatMap((p) => p.items) ?? initialPage.items;

  const previewFit =
    previewDetails?.fitLabels.slice(0, MAX_CARD_FIT_LABELS) ??
    preview?.fitLabels.slice(0, MAX_CARD_FIT_LABELS).map((fit) => fit.label) ??
    [];

  if (status === "error") {
    return <p className="text-m text-[var(--impronta-muted)]">{ui.loadResultsError}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--impronta-gold-border)] bg-black/20 px-6 py-16 text-center text-m text-[var(--impronta-muted)]">
        {ui.emptyResults}
      </p>
    );
  }

  const sourcePage = discoveryState.searchContext?.sourcePage ?? "/directory";

  return (
    <>
      {view === "list" ? (
        <div className="flex flex-col gap-3">
          {items.map((card, index) => (
            <TalentDirectoryListRow
              key={card.id}
              card={card}
              saved={isSaved(card.id)}
              onSaveToggle={() => toggleSave(card.id)}
              onQuickPreview={() => openPreview(card)}
              priority={index < 4}
              sourcePage={sourcePage}
              ui={ui}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {items.map((card, index) => (
            <TalentCard
              key={card.id}
              card={card}
              saved={isSaved(card.id)}
              onSaveToggle={() => toggleSave(card.id)}
              onQuickPreview={() => openPreview(card)}
              priority={index < 4}
              sourcePage={sourcePage}
              ui={ui}
            />
          ))}
        </div>
      )}
      <div
        ref={sentinelRef}
        className="flex h-12 w-full items-center justify-center"
        aria-hidden
      >
        {isFetchingNextPage ? (
          <span className="text-sm text-[var(--impronta-muted)]">{ui.loadingMore}</span>
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        aria-label={
          preview ? formatPreviewDialogAria(ui.preview, preview.displayName) : undefined
        }
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-6 text-[var(--impronta-foreground)] shadow-xl [&::backdrop]:bg-black/75"
        onClose={() => {
          setPreview(null);
          setPreviewDetails(null);
        }}
      >
        {preview ? (
          <div className="space-y-4">
            {previewDetails?.image?.url ? (
              <div
                className="relative overflow-hidden rounded-lg bg-black/20"
                style={{
                  aspectRatio:
                    previewDetails.image.width && previewDetails.image.height
                      ? `${previewDetails.image.width} / ${previewDetails.image.height}`
                      : "3 / 4",
                }}
              >
                <Image
                  src={previewDetails.image.url}
                  alt={formatPreviewImageAlt(ui.preview, preview.displayName)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 24rem"
                />
              </div>
            ) : null}
            <div>
              <h2 className="font-[family-name:var(--font-cinzel)] text-xl font-semibold tracking-wide">
                {preview.displayName}
              </h2>
              <p className="mt-1 text-m text-[var(--impronta-muted)]">
                <span className="truncate">
                  {preview.primaryTalentTypeLabel}
                  {`${previewDetails?.livesInLabel ?? preview.locationLabel ?? ""}`.trim()
                    ? ` · ${`${previewDetails?.livesInLabel ?? preview.locationLabel ?? ""}`.trim()}`
                    : ""}
                </span>
              </p>
              {(previewDetails?.originallyFromLabel ?? "").trim() ? (
                <p className="mt-1 text-xs text-[var(--impronta-muted)]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--impronta-gold-dim)]">
                    {ui.preview.originallyFrom}
                  </span>{" "}
                  {previewDetails?.originallyFromLabel}
                </p>
              ) : null}
            </div>
            {previewFit.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {previewFit.map((label) => (
                  <li
                    key={label}
                    className="max-w-full truncate rounded-full border border-[var(--impronta-gold-border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--impronta-gold-dim)]"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : null}
            {previewDetails?.shortBio ? (
              <p className="text-m leading-6 text-[var(--impronta-muted)]">
                {previewDetails.shortBio}
              </p>
            ) : (
              <p className="text-m text-[var(--impronta-muted)]">{ui.preview.editorialOnly}</p>
            )}
            {previewDetails?.languages?.length ? (
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)]">
                {ui.preview.languagesPrefix} {previewDetails.languages.join(" · ")}
              </p>
            ) : null}
            {previewDetails?.skills?.length ? (
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)]">
                {ui.preview.skillsPrefix} {previewDetails.skills.slice(0, 3).join(" · ")}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <SaveTalentButton
                talent={{
                  id: preview.id,
                  profileCode: preview.profileCode,
                  displayName: preview.displayName,
                }}
                sourcePage={discoveryState.searchContext?.sourcePage ?? "/directory"}
                inquiry={ui.inquiry}
                label={ui.preview.saveThisTalent}
                savedLabel={ui.preview.savedToCart}
                className="w-full border-[var(--impronta-gold-border)] text-[var(--impronta-gold)] hover:text-[var(--impronta-gold)]"
              />
              <ContactTalentButton
                talent={{
                  id: preview.id,
                  profileCode: preview.profileCode,
                  displayName: preview.displayName,
                }}
                sourcePage={discoveryState.searchContext?.sourcePage ?? "/directory"}
                inquiry={ui.inquiry}
                className="w-full bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
              />
              <Button asChild variant="ghost" className="w-full">
                <Link
                  href={clientLocaleHref(
                    pathname,
                    `/t/${encodeURIComponent(preview.profileCode)}`,
                  )}
                >
                  {ui.preview.viewFullProfile}
                </Link>
              </Button>
            </div>
            <form method="dialog" className="flex justify-end">
              <Button type="submit" variant="outline">
                {ui.preview.close}
              </Button>
            </form>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
